import "server-only";
import { eq } from "drizzle-orm";
import { fail, type Failure, ok } from "@/lib/result";
import type {
  DiscardBreakdownInput,
  RateBreakdownInput,
  RequestBreakdownInput,
} from "@/lib/schemas/ai";
import { now, toLocalDateTime } from "@/lib/time";
import { type BreakdownFailureReason, runBreakdown } from "@/server/ai/breakdown";
import type { AiClient } from "@/server/ai/client";
import { spreadStepDates } from "@/server/ai/dates";
import { discardSuggestionRules, rateSuggestionRules, type SuggestedItem } from "@/server/ai/policy";
import { shortenDescription } from "@/server/ai/prompts/breakdown.v1";
import { CURRENT_BREAKDOWN_PROMPT } from "@/server/ai/prompts";
import { findBreakdownInput, findSuggestionTarget, ownBreakdownSuggestion } from "@/server/ai/queries";
import { type AiQueue, getAiQueue, type QueueRejection } from "@/server/ai/queue";
import { getOllamaClient } from "@/server/ai/runtime";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { aiSuggestions } from "@/server/db/schema";
import { decisionToFailure } from "@/server/policies/decision";
import { runRules } from "@/server/policies/evaluate-record";
import { breakdownRules } from "@/server/tasks/policy";
import { findTaskTarget } from "@/server/tasks/queries";

// The ONLY place that writes `ai_suggestions` (saving the steps of a suggestion also resolves it, in
// createStepsFromBreakdown in src/server/tasks/commands.ts, in one transaction with the steps).
//
// The caller (a server action) has already run authorizeRecord() with BOTH keys ai.use and task.personal.manage
// (rule AI-e). The commands run the same record rules again on fresh rows.
//
// Asking the model takes seconds, so requestBreakdown never holds a database transaction or a row lock while it
// waits: it writes the pending row, lets go, asks, and writes the result. Saving the steps re-checks everything
// under locks, so a task that changed while the model was thinking is caught there.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const NO_PERMISSIONS: ReadonlySet<string> = new Set();

export type BreakdownDeps = {
  client: AiClient & { model: string };
  queue: AiQueue;
};

const defaultDeps = (): BreakdownDeps => ({ client: getOllamaClient(), queue: getAiQueue() });

const QUEUE_MESSAGES: Record<QueueRejection, (retryAfterMs?: number) => string> = {
  busy: () => "The AI is busy with other requests. Try again in a moment.",
  you_are_waiting: () => "You already have a breakdown in progress. Wait for it to finish.",
  too_soon: (retryAfterMs) =>
    `Please wait ${Math.max(1, Math.ceil((retryAfterMs ?? 0) / 1000))} seconds before asking again.`,
};

const AI_FAILURE_CODES: Record<BreakdownFailureReason, string> = {
  invalid: "ai_invalid",
  empty: "ai_invalid",
  http_error: "ai_error",
  timeout: "ai_timeout",
  offline: "ai_offline",
  model_missing: "ai_model_missing",
};

/** One suggested step as the screen receives it: plain values, dates as instants. */
export type SuggestedStep = { title: string; minutes: number; deadline: Date | null };

export type BreakdownSuggestion = {
  suggestionId: string;
  steps: SuggestedStep[];
  promptVersion: string;
  /** How many people were ahead in the line when this request arrived (0 when the model was free). */
  waitedBehind: number;
};

type JobResult =
  | { done: true; value: Omit<BreakdownSuggestion, "waitedBehind"> }
  | { done: false; failure: Failure };

/**
 * Asks the model to break a task down (docs/data-flows.md §8.1). The queue admits the request first (one at a
 * time on the model, a line of 3, one per person, a pause between requests); inside the job the task is read
 * again and the rules run on it, a `pending` row records what is sent, and the result is stored.
 * Nothing is saved to the task: the student reviews the steps first.
 */
export async function requestBreakdown(
  actor: CurrentUser,
  input: RequestBreakdownInput,
  deps: BreakdownDeps = defaultDeps(),
) {
  const outcome = await deps.queue.run<JobResult>(actor.id, () => breakdownJob(actor, input, deps));

  if (!outcome.ok) {
    if (outcome.reason === "timeout") {
      return fail("ai_timeout", "The AI took too long to answer. Try again in a moment, or add steps yourself.");
    }
    return fail(outcome.reason, QUEUE_MESSAGES[outcome.reason](outcome.reason === "too_soon" ? outcome.retryAfterMs : undefined));
  }
  if (!outcome.value.done) return outcome.value.failure;
  return ok<BreakdownSuggestion>({ ...outcome.value.value, waitedBehind: outcome.waitedBehind });
}

async function breakdownJob(actor: CurrentUser, input: RequestBreakdownInput, deps: BreakdownDeps): Promise<JobResult> {
  // Read fresh: the person may have waited in the line, and the task may have changed meanwhile.
  const target = await findTaskTarget(db, actor.id, input.taskId);
  if (!target) return { done: false, failure: fail("not_found", "That task was not found.") };
  const decision = runRules(breakdownRules(), { user: actor, permissions: NO_PERMISSIONS, record: target });
  if (!decision.allow) return { done: false, failure: decisionToFailure(decision) };
  const task = await findBreakdownInput(db, actor, input.taskId);
  if (!task) return { done: false, failure: fail("not_found", "That task was not found.") };

  const at = now();
  const today = toLocalDateTime(at, actor.timezone).date;
  const description = task.description ? shortenDescription(task.description) : null;
  const prompt = CURRENT_BREAKDOWN_PROMPT;

  // What is sent, as the row records it. The list the student is shown is added once the answer is valid.
  const sent = {
    title: task.title,
    description,
    existingSteps: task.existingStepTitles,
    today,
    deadline: task.deadline ? task.deadline.toISOString() : null,
    timeZone: actor.timezone,
  };

  const [row] = await db
    .insert(aiSuggestions)
    .values({
      userId: actor.id,
      taskId: input.taskId,
      kind: "breakdown",
      model: deps.client.model,
      promptVersion: prompt.version,
      inputSnapshot: sent,
      createdAt: at,
    })
    .returning({ id: aiSuggestions.id });

  const result = await runBreakdown({
    client: deps.client,
    task: { title: task.title, description: task.description },
    existingStepTitles: task.existingStepTitles,
    today,
    prompt,
  });

  if (!result.ok) {
    const resolvedAt = now();
    await db
      .update(aiSuggestions)
      .set({
        outputRaw: result.raw,
        outputValid: false,
        latencyMs: result.latencyMs,
        promptVersion: result.promptVersion,
        outcome: "failed",
        resolvedAt: resolvedAt.getTime() < at.getTime() ? at : resolvedAt,
      })
      .where(eq(aiSuggestions.id, row.id));
    return { done: false, failure: fail(AI_FAILURE_CODES[result.reason], result.message) };
  }

  // Code assigns the dates (AI-d); the model never wrote one.
  const dates = await spreadStepDates({
    runner: db,
    minutes: result.steps.map((step) => step.minutes),
    now: at,
    deadline: task.deadline,
    timeZone: actor.timezone,
  });
  const steps: SuggestedStep[] = result.steps.map((step, index) => ({
    title: step.title,
    minutes: step.minutes,
    deadline: dates[index],
  }));
  const shown: SuggestedItem[] = steps.map((step) => ({
    title: step.title,
    minutes: step.minutes,
    deadline: step.deadline ? step.deadline.toISOString() : null,
  }));

  await db
    .update(aiSuggestions)
    .set({
      outputRaw: result.raw,
      outputValid: true,
      latencyMs: result.latencyMs,
      promptVersion: result.promptVersion,
      itemsSuggested: steps.length,
      inputSnapshot: { ...sent, suggested: shown },
    })
    .where(eq(aiSuggestions.id, row.id));

  return { done: true, value: { suggestionId: row.id, steps, promptVersion: result.promptVersion } };
}

/** Locks the actor's own suggestion and reads it. Null when it is not theirs. */
async function lockSuggestion(tx: Tx, actor: CurrentUser, suggestionId: string) {
  const [row] = await tx
    .select({ id: aiSuggestions.id })
    .from(aiSuggestions)
    .where(ownBreakdownSuggestion(actor.id, suggestionId))
    .for("update");
  if (!row) return null;
  return findSuggestionTarget(tx, actor.id, suggestionId);
}

/** Closes a pending suggestion without saving anything (outcome discarded). */
export async function discardBreakdown(actor: CurrentUser, input: DiscardBreakdownInput) {
  return db.transaction(async (tx) => {
    const suggestion = await lockSuggestion(tx, actor, input.suggestionId);
    if (!suggestion) return fail("not_found", "That suggestion was not found.");
    const decision = runRules(discardSuggestionRules(), {
      user: actor,
      permissions: NO_PERMISSIONS,
      record: suggestion,
    });
    if (!decision.allow) return decisionToFailure(decision);

    await tx
      .update(aiSuggestions)
      .set({ outcome: "discarded", resolvedAt: now() })
      .where(eq(aiSuggestions.id, suggestion.id));
    return ok({ suggestionId: suggestion.id });
  });
}

/** The optional stars and comment after the steps were saved (AI-h). A later rating replaces an earlier one. */
export async function rateBreakdown(actor: CurrentUser, input: RateBreakdownInput) {
  return db.transaction(async (tx) => {
    const suggestion = await lockSuggestion(tx, actor, input.suggestionId);
    if (!suggestion) return fail("not_found", "That suggestion was not found.");
    const decision = runRules(rateSuggestionRules(), {
      user: actor,
      permissions: NO_PERMISSIONS,
      record: suggestion,
    });
    if (!decision.allow) return decisionToFailure(decision);

    await tx
      .update(aiSuggestions)
      .set({
        // A comment on its own must not wipe an earlier rating, and the other way round.
        ...(input.rating !== null ? { rating: input.rating } : {}),
        ...(input.feedback !== null ? { feedbackText: input.feedback } : {}),
      })
      .where(eq(aiSuggestions.id, suggestion.id));
    return ok({ suggestionId: suggestion.id });
  });
}
