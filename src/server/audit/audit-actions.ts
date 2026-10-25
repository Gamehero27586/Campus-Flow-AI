import "server-only";

// Every audit action name, in one place, so the names cannot drift (a typo would make a search of
// the audit log miss events). Not to be confused with server actions: these are labels in audit_logs.action.
// Pattern: <thing>.<what happened>. Admin read access adds details.via = "admin" (docs/data-model.md).

export const AUDIT_ACTIONS = [
  // Accounts
  "user.approved",
  "user.reapproved",
  "user.rejected",
  "user.reset_to_pending",
  "user.promoted_to_admin",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
