import "server-only";
import { z } from "zod";
import {
  AI_STEP_MINUTES_MAX,
  AI_STEP_MINUTES_MIN,
  AI_STEP_TITLE_MAX_LENGTH,
  AI_STEP_TITLE_MIN_LENGTH,
  AI_STEPS_MAX,
  AI_STEPS_MIN,
} from "@/config/limits";

// What the model may answer for a breakdown: titles and minutes only. Dates are assigned by code
// (CLAUDE.md "AI rules"), so the model is never asked for one. The limits are checked here, after the
// answer arrives: they are also sent to Ollama in `format`, but only this schema is trusted to enforce them
// (docs/data-flows.md §8.1 step 7).

/** How two titles are compared: ignoring case and runs of spaces. */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

// A web address (with http, or starting www.), an email address, or a bare domain with a common ending.
// AI steps never contain links (docs/reviews/slice-4a-opus-review.md I1): a faculty-written description that
// slipped a link into the plan would otherwise reach every student's suggested steps.
const LINK_PATTERN =
  /(?:https?:\/\/|ftp:\/\/|www\.)|[\w.+-]+@[\w-]+\.[\w.-]+|\b[a-z0-9-]+\.(?:com|org|net|edu|gov|io|dev|app|ly|ac\.in)\b/i;

export function containsLink(text: string): boolean {
  return LINK_PATTERN.test(text);
}

export const breakdownStepSchema = z.object({
  title: z
    .string()
    .trim()
    .min(AI_STEP_TITLE_MIN_LENGTH, `Use at least ${AI_STEP_TITLE_MIN_LENGTH} characters.`)
    .max(AI_STEP_TITLE_MAX_LENGTH, `Use at most ${AI_STEP_TITLE_MAX_LENGTH} characters.`),
  minutes: z
    .number()
    .int()
    .min(AI_STEP_MINUTES_MIN)
    .max(AI_STEP_MINUTES_MAX),
});

export const breakdownOutputSchema = z.object({
  steps: z
    .array(breakdownStepSchema)
    .min(AI_STEPS_MIN, `At least ${AI_STEPS_MIN} steps.`)
    .max(AI_STEPS_MAX, `At most ${AI_STEPS_MAX} steps.`)
    .refine(
      (steps) => new Set(steps.map((step) => normalizeTitle(step.title))).size === steps.length,
      "Step titles must not repeat.",
    ),
});

export type BreakdownStep = z.infer<typeof breakdownStepSchema>;
export type BreakdownOutput = z.infer<typeof breakdownOutputSchema>;
