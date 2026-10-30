import "server-only";
import { MAX_SUBTASKS_PER_TASK } from "@/config/limits";
import { type AiClient, OllamaError, type OllamaFailureReason } from "@/server/ai/client";
import { type BreakdownPrompt, CURRENT_BREAKDOWN_PROMPT } from "@/server/ai/prompts";
import type { BreakdownTaskInput } from "@/server/ai/prompts/breakdown.v1";
import {
  type BreakdownStep,
  breakdownOutputSchema,
  containsLink,
  normalizeTitle,
} from "@/server/ai/schemas";

// One breakdown: build the prompt, ask the model, validate the answer, retry ONCE with a stricter reminder if it
// does not validate, then tidy the result. Pure apart from the client it is given, so tests use a fake one.
// It never touches the database and never saves anything: the student reviews the steps first.

export type BreakdownFailureReason = "invalid" | OllamaFailureReason;

export type BreakdownResult =
  | {
      ok: true;
      steps: BreakdownStep[];
      /** The model's text from the attempt that was used, exactly as received. */
      raw: string;
      /** Total model time over all attempts, in milliseconds. */
      latencyMs: number;
      /** 1 = valid first time, 2 = valid after the retry. */
      attempts: 1 | 2;
      promptVersion: string;
    }
  | {
      ok: false;
      reason: BreakdownFailureReason;
      message: string;
      /** The last text the model wrote, when it wrote any (kept for the log and the evaluation). */
      raw: string | null;
      latencyMs: number;
      attempts: 1 | 2;
      promptVersion: string;
    };

export type RunBreakdownInput = {
  client: AiClient;
  task: BreakdownTaskInput;
  /** Titles of the steps the task already has: sent as "already planned" and never suggested again. */
  existingStepTitles: string[];
  /** Today's date as text (a plain date, for the prompt only). */
  today: string;
  prompt?: BreakdownPrompt;
  timeoutMs?: number;
  /** Passed to the model as a fixed seed. Only the evaluation uses it. */
  seed?: number;
};

/**
 * Tidies a validated answer: drops a suggestion that repeats a step the task already has (ignoring case and
 * spaces), drops any suggestion that contains a web or email address (no links in AI steps, ever), and keeps
 * the total within the task's step limit. May return fewer items than the model gave.
 */
export function tidySteps(steps: BreakdownStep[], existingStepTitles: string[]): BreakdownStep[] {
  const existing = new Set(existingStepTitles.map(normalizeTitle));
  const room = Math.max(0, MAX_SUBTASKS_PER_TASK - existingStepTitles.length);
  return steps
    .filter((step) => !existing.has(normalizeTitle(step.title)) && !containsLink(step.title))
    .slice(0, room);
}

const FAILURE_MESSAGES: Record<BreakdownFailureReason, string> = {
  invalid: "The AI's answer could not be used. Add steps yourself, or try again.",
  timeout: "The AI took too long to answer. Try again in a moment, or add steps yourself.",
  offline: "The AI is not running right now. You can still add steps yourself.",
  model_missing: "The AI model is not installed on this computer.",
  http_error: "The AI had a problem. Try again, or add steps yourself.",
  empty: "The AI's answer could not be used. Add steps yourself, or try again.",
};

export async function runBreakdown(input: RunBreakdownInput): Promise<BreakdownResult> {
  const prompt = input.prompt ?? CURRENT_BREAKDOWN_PROMPT;
  const baseUser = prompt.buildUserPrompt(input.task, input.existingStepTitles, input.today);

  let latencyMs = 0;
  let lastRaw: string | null = null;

  for (const attempt of [1, 2] as const) {
    const user = attempt === 1 ? baseUser : `${baseUser}\n\n${prompt.strictReminder}`;
    try {
      const answer = await input.client.chatJson({
        system: prompt.system,
        user,
        schema: breakdownOutputSchema,
        timeoutMs: input.timeoutMs,
        seed: input.seed,
      });
      latencyMs += answer.latencyMs;
      lastRaw = answer.text;

      const checked = breakdownOutputSchema.safeParse(answer.json);
      if (checked.success) {
        const steps = tidySteps(checked.data.steps, input.existingStepTitles);
        // Nothing left after dropping repeats is as useless as an invalid answer: try once more.
        if (steps.length > 0) {
          return { ok: true, steps, raw: answer.text, latencyMs, attempts: attempt, promptVersion: prompt.version };
        }
      }
      // Invalid (not JSON, wrong shape, out of limits, repeated titles): the loop retries once.
    } catch (error) {
      if (error instanceof OllamaError) {
        // No answer at all. Retrying a timeout would make the student wait twice as long, and an
        // offline model will not come back in a second, so these stop here. A bad HTTP answer or an empty
        // text is treated like an invalid answer and retried once.
        if (error.reason === "http_error" || error.reason === "empty") continue;
        return {
          ok: false,
          reason: error.reason,
          message: FAILURE_MESSAGES[error.reason],
          raw: lastRaw,
          latencyMs,
          attempts: attempt,
          promptVersion: prompt.version,
        };
      }
      throw error;
    }
  }

  return {
    ok: false,
    reason: "invalid",
    message: FAILURE_MESSAGES.invalid,
    raw: lastRaw,
    latencyMs,
    attempts: 2,
    promptVersion: prompt.version,
  };
}
