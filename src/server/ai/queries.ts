import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { aiSuggestions, tasks } from "@/server/db/schema";
import { type SuggestionTarget, suggestionSnapshotSchema } from "@/server/ai/policy";
import { ownPersonalTask } from "@/server/tasks/queries";
import type { RecordScope } from "@/server/policies/evaluate-record";

// Every query is scoped to the signed-in user IN THE QUERY (AI history is tier 1: no Admin path).

type Executor = Pick<typeof db, "select">;

/** The scope: this user's own breakdown suggestion with this id. */
export function ownBreakdownSuggestion(userId: string, suggestionId: string) {
  return and(
    eq(aiSuggestions.id, suggestionId),
    eq(aiSuggestions.userId, userId),
    eq(aiSuggestions.kind, "breakdown"),
  );
}

export async function findSuggestionTarget(
  executor: Executor,
  userId: string,
  suggestionId: string,
): Promise<SuggestionTarget | null> {
  const [row] = await executor
    .select({
      id: aiSuggestions.id,
      userId: aiSuggestions.userId,
      taskId: aiSuggestions.taskId,
      kind: aiSuggestions.kind,
      outcome: aiSuggestions.outcome,
      outputValid: aiSuggestions.outputValid,
      itemsSuggested: aiSuggestions.itemsSuggested,
      inputSnapshot: aiSuggestions.inputSnapshot,
    })
    .from(aiSuggestions)
    .where(ownBreakdownSuggestion(userId, suggestionId));
  if (!row) return null;

  const { inputSnapshot, ...rest } = row;
  const snapshot = suggestionSnapshotSchema.safeParse(inputSnapshot);
  return { ...rest, suggested: snapshot.success ? (snapshot.data.suggested ?? []) : [] };
}

/** The record loader for the discard, save and rate actions: the user's own suggestion, or nothing. */
export async function loadOwnSuggestion(scope: RecordScope, suggestionId: string) {
  return findSuggestionTarget(db, scope.user.id, suggestionId);
}

/** What goes into the prompt for one task: its text, its deadline and the titles of the steps it already has. */
export type BreakdownInput = {
  title: string;
  description: string | null;
  deadline: Date | null;
  existingStepTitles: string[];
};

export async function findBreakdownInput(
  executor: Executor,
  user: CurrentUser,
  taskId: string,
): Promise<BreakdownInput | null> {
  const [task] = await executor
    .select({ title: tasks.title, description: tasks.description, deadline: tasks.deadline })
    .from(tasks)
    .where(ownPersonalTask(user.id, taskId));
  if (!task) return null;

  const steps = await executor
    .select({ title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.parentTaskId, taskId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.createdAt), asc(tasks.id));
  return { ...task, existingStepTitles: steps.map((step) => step.title) };
}
