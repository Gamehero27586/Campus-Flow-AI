import "server-only";
import { fail } from "@/lib/result";

// The answer a record rule gives (steps 4 and 5 of the check pipeline, docs/permissions.md §2).
// Three ways to say no, because they must look different to the person asking:
//   not_found   the person may not see this record at all, so we say it does not exist (never "forbidden"),
//   not_allowed the person can see the record but may not do this to it (for example a team member
//               changing the status of a task assigned to someone else),
//   state       the record is in a state that does not allow it (assignment closed, code expired ...).

export type Decision =
  | { allow: true }
  | {
      allow: false;
      step: 4 | 5;
      outcome: "not_found" | "not_allowed" | "state";
      code: string;
      message: string;
    };

/** A refused decision. */
export type Refusal = Extract<Decision, { allow: false }>;

export const allow: Decision = { allow: true };

/** Step 4: the person is not connected to this record. It is reported as "not found". */
export function notFound(): Refusal {
  return {
    allow: false,
    step: 4,
    outcome: "not_found",
    code: "not_found",
    message: "That record was not found.",
  };
}

/** Step 4: the person can see the record but lacks the capacity for this action. */
export function notAllowed(code: string, message: string): Refusal {
  return { allow: false, step: 4, outcome: "not_allowed", code, message };
}

/** Step 5: the record's state forbids the action. */
export function stateForbids(code: string, message: string): Refusal {
  return { allow: false, step: 5, outcome: "state", code, message };
}

/** The `{ ok: false, error }` result an action returns for a refused decision. */
export function decisionToFailure(decision: Refusal) {
  return fail(decision.code, decision.message);
}
