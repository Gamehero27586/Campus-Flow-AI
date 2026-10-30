import "server-only";
import { z } from "zod";
import { allow, type Decision, notFound, stateForbids } from "@/server/policies/decision";
import type { RecordRules, RuleContext } from "@/server/policies/evaluate-record";

// The rules for one AI suggestion (docs/permissions.md §4: AI history is tier 1). Same two questions as every
// policy: relationship (is this MY suggestion?) and state (is it in the right state for this action?).
// Anyone else's suggestion does not exist for you, and there is no Admin path and no key that would add one.
// Whether the TASK may be broken down is a task rule (breakdownRules in src/server/tasks/policy.ts).

/** What the screen was shown, kept inside the stored snapshot once the answer is valid (see ai/commands.ts). */
export const suggestedItemSchema = z.object({
  title: z.string(),
  minutes: z.number().int(),
  /** The due date the code assigned, as an ISO instant, or null. */
  deadline: z.string().nullable(),
});
export type SuggestedItem = z.infer<typeof suggestedItemSchema>;

export const suggestionSnapshotSchema = z.object({
  suggested: z.array(suggestedItemSchema).optional(),
});

export type SuggestionOutcome = "pending" | "accepted" | "edited" | "discarded" | "failed";

/** One suggestion with just what the rules and the saving command need. Built by ai/queries.ts. */
export type SuggestionTarget = {
  id: string;
  userId: string;
  taskId: string | null;
  kind: "breakdown" | "summary";
  outcome: SuggestionOutcome;
  outputValid: boolean;
  itemsSuggested: number | null;
  /** The list the student was shown, in order; empty until the answer was valid. */
  suggested: SuggestedItem[];
};

type Context = RuleContext<SuggestionTarget>;

function ownBreakdown({ user, record }: Context): Decision {
  return record.userId === user.id && record.kind === "breakdown" ? allow : notFound();
}

const rules = (state: (context: Context) => Decision): RecordRules<SuggestionTarget> => ({
  relationship: ownBreakdown,
  state,
});

const isPending = ({ record }: Context): Decision =>
  record.outcome === "pending"
    ? allow
    : stateForbids("already_resolved", "This suggestion has already been used or closed.");

/** Discard: a suggestion still waiting for the student. */
export const discardSuggestionRules = () => rules(isPending);

/**
 * Save the steps of a suggestion: still pending, the answer was valid, and it was made for THIS task.
 * (That the task is the same user's is checked by the task rules; the user is checked above.)
 */
export const saveSuggestionRules = (taskId: string) =>
  rules((context) => {
    const pending = isPending(context);
    if (!pending.allow) return pending;
    if (!context.record.outputValid) {
      return stateForbids("suggestion_not_valid", "That suggestion has no usable steps.");
    }
    return context.record.taskId === taskId
      ? allow
      : stateForbids("suggestion_mismatch", "That suggestion was made for a different task.");
  });

/** Rate: only a suggestion whose steps were saved (AI-h). */
export const rateSuggestionRules = () =>
  rules(({ record }) =>
    record.outcome === "accepted" || record.outcome === "edited"
      ? allow
      : stateForbids("not_saved", "You can rate a breakdown after you save its steps."),
  );
