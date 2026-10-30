"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type FormState } from "@/lib/result";
import {
  discardBreakdownSchema,
  rateBreakdownSchema,
  requestBreakdownSchema,
  saveBreakdownSchema,
} from "@/lib/schemas/ai";
import { toLocalDateTime } from "@/lib/time";
import { discardBreakdown, rateBreakdown, requestBreakdown } from "@/server/ai/commands";
import { getAiHealthChecker } from "@/server/ai/health";
import { discardSuggestionRules, rateSuggestionRules } from "@/server/ai/policy";
import { loadOwnSuggestion } from "@/server/ai/queries";
import { authorizeRecord } from "@/server/policies/authorize";
import { failureFor } from "@/server/policies/evaluate-record";
import { createStepsFromBreakdown } from "@/server/tasks/commands";
import { addStepsRules, breakdownRules } from "@/server/tasks/policy";
import { loadPersonalTask } from "@/server/tasks/queries";

// The AI breakdown actions (docs/slices/slice-4-plan.md 4d). Same shape as the task actions: parse with Zod,
// run the full five-step check with authorizeRecord(), call ONE command, revalidate, return the result.
// Rule AI-e: requesting, saving and discarding need BOTH keys (it uses the AI AND writes personal steps). Rating
// is not in AI-e; it asks for both too, the stricter choice, since a role without the task key has no
// suggestion to rate. Suggestions are tier 1: only the owner reaches one.

const KEYS = ["ai.use", "task.personal.manage"] as const;

const invalid = (error: z.ZodError) =>
  fail("invalid_input", "Check the highlighted fields.", z.flattenError(error).fieldErrors);

/**
 * The review panel has no per-field error slots, so a refused list is reported as one sentence naming the step:
 * "Step 2: Enter a title."
 */
function invalidSteps(error: z.ZodError) {
  const issue = error.issues[0];
  const [head, index] = issue?.path ?? [];
  const message = head === "items" && typeof index === "number" ? `Step ${index + 1}: ${issue.message}` : (issue?.message ?? "Check the steps.");
  return fail("invalid_input", message);
}

/** A suggested step as the browser receives it: plain values, the due date as the user's local date and time. */
export type SuggestedStepView = {
  title: string;
  minutes: number;
  deadlineDate: string;
  deadlineTime: string;
};

export type BreakdownView = {
  suggestionId: string;
  steps: SuggestedStepView[];
  waitedBehind: number;
};

export async function requestBreakdownAction(
  _previous: null,
  formData: FormData,
): Promise<FormState<BreakdownView>> {
  const parsed = requestBreakdownSchema.safeParse({ taskId: formData.get("taskId") });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEYS,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: breakdownRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  // Known to be off: say so at once, without joining the line or leaving a record.
  const health = await getAiHealthChecker().get();
  if (!health.online) {
    return fail("ai_offline", "The AI is not running right now. You can still add steps yourself.");
  }

  const result = await requestBreakdown(authorization.user, parsed.data);
  if (!result.ok) {
    if (result.error.code === "ai_offline") getAiHealthChecker().forget();
    return result;
  }

  const timeZone = authorization.user.timezone;
  return {
    ok: true,
    data: {
      suggestionId: result.data.suggestionId,
      waitedBehind: result.data.waitedBehind,
      steps: result.data.steps.map((step) => {
        const due = step.deadline ? toLocalDateTime(step.deadline, timeZone) : null;
        return {
          title: step.title,
          minutes: step.minutes,
          deadlineDate: due?.date ?? "",
          deadlineTime: due?.time ?? "",
        };
      }),
    },
  };
}

export async function saveBreakdownAction(
  _previous: null,
  formData: FormData,
): Promise<FormState<{ suggestionId: string; created: number; outcome: "accepted" | "edited" }>> {
  // The rows of the review panel arrive as parallel lists: every row sends every field (blank when empty).
  const titles = formData.getAll("title");
  const items = titles.map((title, index) => ({
    title,
    estimateMinutes: formData.getAll("estimateMinutes")[index],
    deadlineDate: formData.getAll("deadlineDate")[index],
    deadlineTime: formData.getAll("deadlineTime")[index],
    suggestedIndex: formData.getAll("suggestedIndex")[index],
  }));
  const parsed = saveBreakdownSchema.safeParse({
    taskId: formData.get("taskId"),
    suggestionId: formData.get("suggestionId"),
    items,
  });
  if (!parsed.success) return invalidSteps(parsed.error);

  // The record is the TASK that receives the steps; the command also checks the suggestion under a lock.
  const authorization = await authorizeRecord({
    required: KEYS,
    loadRecord: (scope) => loadPersonalTask(scope, parsed.data.taskId),
    rules: addStepsRules(parsed.data.items.length),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await createStepsFromBreakdown(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidatePath("/tasks", "layout");
  return {
    ok: true,
    message: result.data.created === 1 ? "1 step added." : `${result.data.created} steps added.`,
    data: {
      suggestionId: result.data.suggestionId,
      created: result.data.created,
      outcome: result.data.outcome,
    },
  };
}

export async function discardBreakdownAction(
  _previous: null,
  formData: FormData,
): Promise<FormState> {
  const parsed = discardBreakdownSchema.safeParse({ suggestionId: formData.get("suggestionId") });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEYS,
    loadRecord: (scope) => loadOwnSuggestion(scope, parsed.data.suggestionId),
    rules: discardSuggestionRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await discardBreakdown(authorization.user, parsed.data);
  if (!result.ok) return result;
  return { ok: true, message: "Suggestion discarded." };
}

export async function rateBreakdownAction(
  _previous: null,
  formData: FormData,
): Promise<FormState> {
  const parsed = rateBreakdownSchema.safeParse({
    suggestionId: formData.get("suggestionId"),
    rating: formData.get("rating"),
    feedback: formData.get("feedback"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const authorization = await authorizeRecord({
    required: KEYS,
    loadRecord: (scope) => loadOwnSuggestion(scope, parsed.data.suggestionId),
    rules: rateSuggestionRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await rateBreakdown(authorization.user, parsed.data);
  if (!result.ok) return result;
  return { ok: true, message: "Thanks for the feedback." };
}
