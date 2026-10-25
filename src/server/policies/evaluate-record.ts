import "server-only";
import { fail } from "@/lib/result";
import type { CurrentUser } from "@/server/auth/current-user";
import { type Decision, notFound, type Refusal } from "@/server/policies/decision";
import { evaluateAuthorization, type RequiredPermissions } from "@/server/policies/evaluate";

// The whole five-step pipeline for an action on ONE record (docs/permissions.md §2):
//   1 signed in   2 account active   3 role holds the key   (evaluateAuthorization)
//   4 relationship to this record    5 record state          (the rules a domain supplies)
// The first failure stops it. Domains write only the two small rule functions (in their policy.ts);
// the order, the "not found" rule and the "do not even load the record unless steps 1 to 3 pass" rule
// live here, once.

/** Who is asking, and what their role holds right now. */
export type RecordScope = {
  user: CurrentUser;
  permissions: ReadonlySet<string>;
};

export type RuleContext<TRecord> = RecordScope & { record: TRecord };

export type RecordRules<TRecord> = {
  /** Step 4: is this user connected to this record in the capacity this action needs? */
  relationship: (context: RuleContext<TRecord>) => Decision;
  /** Step 5: does the record's state allow the action? Omit when state never matters. */
  state?: (context: RuleContext<TRecord>) => Decision;
};

export type RecordAuthorization<TRecord> =
  | { ok: true; user: CurrentUser; permissions: ReadonlySet<string>; record: TRecord }
  | {
      ok: false;
      step: 1 | 2 | 3;
      reason: "signed_out" | "account_not_active" | "missing_permission";
      redirectTo?: string;
    }
  | { ok: false; step: 4 | 5; decision: Refusal };

/**
 * Steps 4 then 5 for a record already in hand. The pipeline uses it, and so do the commands that
 * re-check inside their transaction, so a rule is written once and called from both places.
 */
export function runRules<TRecord>(
  rules: RecordRules<TRecord>,
  context: RuleContext<TRecord>,
): Decision {
  const relationship = rules.relationship(context);
  if (!relationship.allow) return relationship;
  return rules.state ? rules.state(context) : relationship;
}

export async function evaluateRecordAuthorization<TRecord>(args: {
  user: CurrentUser | null;
  permissions: ReadonlySet<string>;
  required: RequiredPermissions;
  /**
   * Loads the record, scoped to this user IN THE QUERY (never "get by id" without a scope). It gets
   * the permissions as well, so it can say "rows this user is related to, or any row if they may read
   * as Admin". Called only after steps 1 to 3 pass, so a refused request never reaches the record.
   * Returns null when the record does not exist or the scope hides it.
   */
  loadRecord: (scope: RecordScope) => Promise<TRecord | null>;
  rules: RecordRules<TRecord>;
}): Promise<RecordAuthorization<TRecord>> {
  const early = evaluateAuthorization(args.user, args.permissions, args.required);
  if (!early.ok) {
    if (early.reason === "signed_out") return { ok: false, step: 1, reason: "signed_out" };
    if (early.reason === "account_not_active") {
      return { ok: false, step: 2, reason: "account_not_active", redirectTo: early.redirectTo };
    }
    return { ok: false, step: 3, reason: "missing_permission" };
  }

  const scope: RecordScope = { user: early.user, permissions: early.permissions };
  const record = await args.loadRecord(scope);

  // No record (missing, or hidden by the scope) looks exactly like a record the user may not see.
  if (record === null || record === undefined) {
    return { ok: false, step: 4, decision: notFound() };
  }

  const decision = runRules(args.rules, { ...scope, record });
  if (!decision.allow) return { ok: false, step: decision.step, decision };

  return { ok: true, ...scope, record };
}

/** The `{ ok: false, error }` an action returns for a refused authorization of any step. */
export function failureFor(refused: Extract<RecordAuthorization<unknown>, { ok: false }>) {
  if ("decision" in refused) return fail(refused.decision.code, refused.decision.message);
  // Steps 1 to 3 say nothing about why (signed out, not active, or missing key all look the same here).
  return fail("not_allowed", "You cannot do that.");
}
