import "server-only";
import { gate } from "@/server/auth/access-gate";
import type { CurrentUser } from "@/server/auth/current-user";
import type { PermissionKey } from "@/server/auth/permission-keys";
// The pure decision behind authorize(): no database, no request, so it is tested as a table.
// Steps 1 to 3 of docs/permissions.md §2. Steps 4 (relationship) and 5 (record state) come in Slice 2.

export type AuthorizationDenial =
  | { ok: false; reason: "signed_out" }
  | { ok: false; reason: "account_not_active"; redirectTo: string }
  | { ok: false; reason: "missing_permission" };

export type Authorization =
  { ok: true; user: CurrentUser; permissions: ReadonlySet<string> } | AuthorizationDenial;

/** One key, or several that must ALL be held (for example approving needs two). */
export type RequiredPermissions = PermissionKey | readonly PermissionKey[] | null;

export function evaluateAuthorization(
  user: CurrentUser | null,
  permissions: ReadonlySet<string>,
  required: RequiredPermissions,
): Authorization {
  // 1. Signed in
  if (!user) return { ok: false, reason: "signed_out" };

  // 2. Account active, with a username
  const decision = gate(user, "app");
  if (!decision.allow) {
    return { ok: false, reason: "account_not_active", redirectTo: decision.redirectTo };
  }

  // 3. The role holds every required key
  const keys = required === null ? [] : typeof required === "string" ? [required] : required;
  if (!keys.every((key) => permissions.has(key)))
    return { ok: false, reason: "missing_permission" };

  return { ok: true, user, permissions };
}
