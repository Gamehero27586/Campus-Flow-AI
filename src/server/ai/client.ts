import "server-only";
import { z } from "zod";
import {
  AI_CALL_TIMEOUT_MS,
  AI_HEALTH_TIMEOUT_MS,
  AI_KEEP_ALIVE,
  AI_NUM_CTX,
} from "@/config/limits";
import { isLocalAddress } from "@/lib/local-address";

// The only place that talks to Ollama (CLAUDE.md "AI rules"). Everything runs on this computer: the client
// refuses any address other than localhost, so a task can never be sent anywhere else.
//
// Ollama API fields, checked against https://docs.ollama.com/api/chat on 30 Oct 2026 and by calling a local
// Ollama 0.40.10 with llama3.2:3b:
//   POST /api/chat  { model, messages: [{ role, content }], stream, format (a JSON schema object), options:
//                     { temperature, num_ctx }, keep_alive ("30m") }
//   answer          { message: { content }, done, done_reason, total_duration (nanoseconds), eval_count, ... }
//   empty messages  loads the model (done_reason "load"), used by the warm-up
//   GET /api/version  { version }
//   model not installed: HTTP 404.

export type OllamaFailureReason =
  | "offline" // nothing is listening, or the connection failed
  | "timeout" // no answer within the time limit
  | "model_missing" // the model is not installed (HTTP 404)
  | "http_error" // any other error status
  | "empty"; // an answer with no text

/** A failure to get an answer from the model at all (as opposed to an answer that does not validate). */
export class OllamaError extends Error {
  constructor(
    public readonly reason: OllamaFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

export type ChatJsonRequest = {
  system: string;
  user: string;
  /** The answer's shape. Its JSON schema is sent to Ollama in `format`. */
  schema: z.ZodType;
  timeoutMs?: number;
  /**
   * A fixed random seed, so the same prompt gives the same answer. Only `npm run eval:ai` sets it (so the
   * tables of two prompt versions are comparable); the app never does, and then Ollama picks its own.
   */
  seed?: number;
};

export type ChatJsonResponse = {
  /** Exactly what the model wrote. */
  text: string;
  /** The text parsed as JSON, or undefined when it is not JSON (see parseError). */
  json: unknown;
  parseError: string | null;
  /** Wall-clock time for the call, in milliseconds. */
  latencyMs: number;
  /** Ollama's own counts, when it sent them. */
  stats: { evalCount: number | null; promptEvalCount: number | null; totalMs: number | null };
};

export type AiClient = {
  chatJson(request: ChatJsonRequest): Promise<ChatJsonResponse>;
};

export type HealthResult = { ok: true; version: string } | { ok: false };

export type OllamaClientOptions = {
  /** Ollama's address: only localhost is accepted. */
  baseUrl: string;
  model: string;
  /** Replaceable so tests need no real server. */
  fetch?: typeof fetch;
};

const nsToMs = (value: unknown) => (typeof value === "number" ? Math.round(value / 1e6) : null);

export function createOllamaClient(options: OllamaClientOptions) {
  if (!isLocalAddress(options.baseUrl)) {
    throw new Error(
      "OLLAMA_URL must point at this computer (localhost or 127.0.0.1). Tasks are never sent to another address.",
    );
  }
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const model = options.model;

  /** One POST to /api/chat; throws OllamaError for anything that is not an answer. */
  async function post(body: Record<string, unknown>, timeoutMs: number): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new OllamaError("timeout", `The AI did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw new OllamaError("offline", "The AI is not running on this computer.");
    }

    if (response.status === 404) {
      throw new OllamaError(
        "model_missing",
        `The model ${model} is not installed. Run: ollama pull ${model}`,
      );
    }
    if (!response.ok) {
      throw new OllamaError("http_error", `The AI answered with an error (HTTP ${response.status}).`);
    }
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      // The body can also fail to arrive in time.
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new OllamaError("timeout", `The AI did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw new OllamaError("http_error", "The AI's answer could not be read.");
    }
  }

  return {
    model,

    /**
     * Asks the model for JSON of a given shape: non-streaming, temperature 0, a fixed context size, the model
     * kept loaded afterwards. Returns the raw text AND the parsed JSON, so the caller can validate and keep
     * both. Never validates the content itself.
     */
    async chatJson(request: ChatJsonRequest): Promise<ChatJsonResponse> {
      const started = Date.now();
      const answer = await post(
        {
          model,
          stream: false,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          format: z.toJSONSchema(request.schema),
          options: {
            temperature: 0,
            num_ctx: AI_NUM_CTX,
            ...(request.seed !== undefined ? { seed: request.seed } : {}),
          },
          keep_alive: AI_KEEP_ALIVE,
        },
        request.timeoutMs ?? AI_CALL_TIMEOUT_MS,
      );
      const latencyMs = Date.now() - started;

      const message = answer.message as { content?: unknown } | undefined;
      const text = typeof message?.content === "string" ? message.content : "";
      if (text.trim() === "") throw new OllamaError("empty", "The AI sent an empty answer.");

      let json: unknown;
      let parseError: string | null = null;
      try {
        json = JSON.parse(text);
      } catch (error) {
        parseError = error instanceof Error ? error.message : "Not JSON";
      }
      return {
        text,
        json,
        parseError,
        latencyMs,
        stats: {
          evalCount: typeof answer.eval_count === "number" ? answer.eval_count : null,
          promptEvalCount: typeof answer.prompt_eval_count === "number" ? answer.prompt_eval_count : null,
          totalMs: nsToMs(answer.total_duration),
        },
      };
    },

    /** Loads the model into memory so the first real request does not wait for it (an empty chat). */
    async warm(timeoutMs = AI_CALL_TIMEOUT_MS): Promise<void> {
      await post({ model, messages: [], keep_alive: AI_KEEP_ALIVE }, timeoutMs);
    },

    /**
     * Takes the model out of memory (an empty chat with keep_alive 0). Used by the evaluation to measure a
     * cold start; the app itself never unloads the model.
     */
    async unload(timeoutMs = AI_CALL_TIMEOUT_MS): Promise<void> {
      await post({ model, messages: [], keep_alive: 0 }, timeoutMs);
    },

    /** Is Ollama answering? Never throws, and never waits more than two seconds. */
    async health(): Promise<HealthResult> {
      try {
        const response = await doFetch(`${baseUrl}/api/version`, {
          signal: AbortSignal.timeout(AI_HEALTH_TIMEOUT_MS),
        });
        if (!response.ok) return { ok: false };
        const body = (await response.json()) as { version?: unknown };
        return { ok: true, version: typeof body.version === "string" ? body.version : "unknown" };
      } catch {
        return { ok: false };
      }
    },
  };
}

export type OllamaClient = ReturnType<typeof createOllamaClient>;
