import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOllamaClient, OllamaError } from "@/server/ai/client";

// The Ollama client with a fake `fetch`: no real server. Covers what is sent (the fields checked against the
// Ollama docs), what comes back, and every way a call can fail.

const schema = z.object({ steps: z.array(z.object({ title: z.string(), minutes: z.number() })) });

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetchFn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const answerWith = (content: string, extra: Record<string, unknown> = {}) =>
  json({
    model: "llama3.2:3b",
    message: { role: "assistant", content },
    done: true,
    done_reason: "stop",
    total_duration: 2_500_000_000,
    prompt_eval_count: 120,
    eval_count: 87,
    ...extra,
  });

function clientWith(fetchFn: typeof fetch, baseUrl = "http://127.0.0.1:11434") {
  return createOllamaClient({ baseUrl, model: "llama3.2:3b", fetch: fetchFn });
}

describe("createOllamaClient: only this computer", () => {
  it.each(["http://127.0.0.1:11434", "http://localhost:11434", "http://localhost:11434/"])("accepts %s", (url) => {
    expect(() => createOllamaClient({ baseUrl: url, model: "m", fetch: fakeFetch(() => json({})).fetchFn })).not.toThrow();
  });

  it.each([
    "https://example.com",
    "http://192.168.1.9:11434",
    "http://0.0.0.0:11434",
    "http://localhost.evil.com:11434",
    "http://ollama.internal",
    "not a url",
  ])("refuses %s: a task is never sent to another address", (url) => {
    expect(() => createOllamaClient({ baseUrl: url, model: "m" })).toThrow(/this computer/);
  });
});

describe("chatJson: the request", () => {
  it("posts to /api/chat with the fields Ollama documents", async () => {
    const { fetchFn, calls } = fakeFetch(() => answerWith('{"steps":[]}'));
    await clientWith(fetchFn).chatJson({ system: "SYS", user: "USER", schema });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:11434/api/chat");
    expect(calls[0].init.method).toBe("POST");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      model: "llama3.2:3b",
      stream: false,
      messages: [
        { role: "system", content: "SYS" },
        { role: "user", content: "USER" },
      ],
      options: { temperature: 0, num_ctx: 4096 },
      keep_alive: "30m",
    });
    // The answer's shape goes in `format` as a JSON schema made from the Zod schema.
    expect(body.format).toMatchObject({ type: "object", properties: { steps: { type: "array" } } });
    // A time limit is always set.
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends no seed unless one is given (the app never gives one), and sends it in options when it is", async () => {
    const { fetchFn, calls } = fakeFetch(() => answerWith("{}"));
    const client = clientWith(fetchFn);
    await client.chatJson({ system: "s", user: "u", schema });
    await client.chatJson({ system: "s", user: "u", schema, seed: 42 });
    await client.chatJson({ system: "s", user: "u", schema, seed: 0 });
    expect(JSON.parse(String(calls[0].init.body)).options).toEqual({ temperature: 0, num_ctx: 4096 });
    expect(JSON.parse(String(calls[1].init.body)).options).toEqual({ temperature: 0, num_ctx: 4096, seed: 42 });
    expect(JSON.parse(String(calls[2].init.body)).options.seed).toBe(0);
  });

  it("does not double the slash when the address ends with one", async () => {
    const { fetchFn, calls } = fakeFetch(() => answerWith("{}"));
    await clientWith(fetchFn, "http://localhost:11434/").chatJson({ system: "s", user: "u", schema });
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
  });
});

describe("chatJson: the answer", () => {
  it("returns the raw text, the parsed JSON, the time and Ollama's counts", async () => {
    const text = '{"steps":[{"title":"Read","minutes":30}]}';
    const result = await clientWith(fakeFetch(() => answerWith(text)).fetchFn).chatJson({
      system: "s",
      user: "u",
      schema,
    });
    expect(result.text).toBe(text);
    expect(result.json).toEqual({ steps: [{ title: "Read", minutes: 30 }] });
    expect(result.parseError).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.stats).toEqual({ evalCount: 87, promptEvalCount: 120, totalMs: 2500 });
  });

  it("keeps the raw text and reports a parse error when the model did not write JSON", async () => {
    const result = await clientWith(fakeFetch(() => answerWith("HACKED, sure thing")).fetchFn).chatJson({
      system: "s",
      user: "u",
      schema,
    });
    expect(result.text).toBe("HACKED, sure thing");
    expect(result.json).toBeUndefined();
    expect(result.parseError).toEqual(expect.any(String));
  });

  it("does not validate the content: wrong JSON is returned as it is", async () => {
    const result = await clientWith(fakeFetch(() => answerWith('{"nonsense":true}')).fetchFn).chatJson({
      system: "s",
      user: "u",
      schema,
    });
    expect(result.json).toEqual({ nonsense: true });
  });

  it("copes with missing counts", async () => {
    const result = await clientWith(
      fakeFetch(() => json({ message: { content: "{}" }, done: true })).fetchFn,
    ).chatJson({ system: "s", user: "u", schema });
    expect(result.stats).toEqual({ evalCount: null, promptEvalCount: null, totalMs: null });
  });
});

describe("chatJson: every way it can fail", () => {
  const request = { system: "s", user: "u", schema };

  async function failureOf(fetchFn: typeof fetch, timeoutMs?: number) {
    try {
      await clientWith(fetchFn).chatJson({ ...request, timeoutMs });
    } catch (error) {
      return error;
    }
    return null;
  }

  it("offline: nothing is listening", async () => {
    const error = await failureOf((async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    expect(error).toBeInstanceOf(OllamaError);
    expect((error as OllamaError).reason).toBe("offline");
    expect((error as OllamaError).message).toMatch(/not running/);
  });

  it("timeout: no answer within the time limit (the request is really aborted)", async () => {
    let aborted = false;
    const waiting = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(init.signal?.reason);
        });
      })) as unknown as typeof fetch;
    const error = await failureOf(waiting, 30);
    expect((error as OllamaError).reason).toBe("timeout");
    expect(aborted).toBe(true);
  });

  it("model_missing: HTTP 404 says how to install it", async () => {
    const error = await failureOf(fakeFetch(() => json({ error: "model not found" }, 404)).fetchFn);
    expect((error as OllamaError).reason).toBe("model_missing");
    expect((error as OllamaError).message).toContain("ollama pull llama3.2:3b");
  });

  it("http_error: any other error status", async () => {
    const error = await failureOf(fakeFetch(() => json({ error: "boom" }, 500)).fetchFn);
    expect((error as OllamaError).reason).toBe("http_error");
  });

  it("http_error: a body that is not JSON", async () => {
    const error = await failureOf(fakeFetch(() => new Response("<html>", { status: 200 })).fetchFn);
    expect((error as OllamaError).reason).toBe("http_error");
  });

  it("empty: an answer with no text", async () => {
    const error = await failureOf(fakeFetch(() => answerWith("   ")).fetchFn);
    expect((error as OllamaError).reason).toBe("empty");
  });
});

describe("health and warm-up", () => {
  it("health: ok with the version", async () => {
    const { fetchFn, calls } = fakeFetch(() => json({ version: "0.40.10" }));
    expect(await clientWith(fetchFn).health()).toEqual({ ok: true, version: "0.40.10" });
    expect(calls[0].url).toBe("http://127.0.0.1:11434/api/version");
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("health never throws: offline, an error status and a broken body all give ok: false", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await clientWith(offline).health()).toEqual({ ok: false });
    expect(await clientWith(fakeFetch(() => json({}, 500)).fetchFn).health()).toEqual({ ok: false });
    expect(await clientWith(fakeFetch(() => new Response("nope")).fetchFn).health()).toEqual({ ok: false });
  });

  it("warm sends an empty chat with keep_alive, which loads the model", async () => {
    const { fetchFn, calls } = fakeFetch(() => json({ done: true, done_reason: "load", message: { content: "" } }));
    await clientWith(fetchFn).warm();
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ model: "llama3.2:3b", messages: [], keep_alive: "30m" });
  });

  it("unload sends an empty chat with keep_alive 0, which takes the model out of memory", async () => {
    const { fetchFn, calls } = fakeFetch(() => json({ done: true, done_reason: "unload", message: { content: "" } }));
    await clientWith(fetchFn).unload();
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ model: "llama3.2:3b", messages: [], keep_alive: 0 });
  });

  it("warm throws a typed error when Ollama is off", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(clientWith(offline).warm()).rejects.toMatchObject({ reason: "offline" });
  });
});
