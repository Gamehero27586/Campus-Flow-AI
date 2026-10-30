import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
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

/** One saved breakdown of a task, with its rating, for the task page. */
export type SavedBreakdown = {
  id: string;
  outcome: "accepted" | "edited";
  itemsSuggested: number | null;
  itemsKept: number | null;
  rating: number | null;
  feedback: string | null;
  savedAt: Date;
};

/**
 * The breakdowns of one of the user's own tasks whose steps were saved (accepted or edited), newest first, so each
 * can be rated or re-rated at any time (AI-h). Scoped to the user in the query: AI history is tier 1.
 */
export async function listSavedBreakdowns(
  executor: Executor,
  user: CurrentUser,
  taskId: string,
): Promise<SavedBreakdown[]> {
  const rows = await executor
    .select({
      id: aiSuggestions.id,
      outcome: aiSuggestions.outcome,
      itemsSuggested: aiSuggestions.itemsSuggested,
      itemsKept: aiSuggestions.itemsKept,
      rating: aiSuggestions.rating,
      feedback: aiSuggestions.feedbackText,
      resolvedAt: aiSuggestions.resolvedAt,
    })
    .from(aiSuggestions)
    .where(
      and(
        eq(aiSuggestions.userId, user.id),
        eq(aiSuggestions.taskId, taskId),
        eq(aiSuggestions.kind, "breakdown"),
        inArray(aiSuggestions.outcome, ["accepted", "edited"]),
      ),
    )
    .orderBy(desc(aiSuggestions.resolvedAt), desc(aiSuggestions.id));

  return rows.flatMap((row) =>
    row.resolvedAt && (row.outcome === "accepted" || row.outcome === "edited")
      ? [{ ...row, outcome: row.outcome, savedAt: row.resolvedAt }]
      : [],
  );
}

/** listSavedBreakdowns on the real database, for the task page (pages never import the database). */
export const listMySavedBreakdowns = (user: CurrentUser, taskId: string) => listSavedBreakdowns(db, user, taskId);
