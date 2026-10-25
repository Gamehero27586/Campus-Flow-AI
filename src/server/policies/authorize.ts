import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { loadPermissionKeys } from "@/server/auth/load-permissions";
import {
  type Authorization,
  evaluateAuthorization,
  type RequiredPermissions,
} from "@/server/policies/evaluate";
import {
  evaluateRecordAuthorization,
  type RecordRules,
  type RecordScope,
} from "@/server/policies/evaluate-record";

/**
 * For server actions and route handlers: returns the decision and lets the caller reply.
 * Pass one key, or an array when the action needs several (all must be held).
 */
export async function authorize(required: RequiredPermissions = null): Promise<Authorization> {
  const user = await getCurrentUser();
  const permissions = user ? await loadPermissionKeys(user.roleId) : new Set<string>();
  return evaluateAuthorization(user, permissions, required);
}

/**
 * The full five-step check for an action on one record. `loadRecord` runs only after steps 1 to 3
 * pass and must scope the query to the user. `rules` are the domain's relationship and state rules.
 */
export async function authorizeRecord<TRecord>(args: {
  required: RequiredPermissions;
  loadRecord: (scope: RecordScope) => Promise<TRecord | null>;
  rules: RecordRules<TRecord>;
}) {
  const user = await getCurrentUser();
  const permissions = user ? await loadPermissionKeys(user.roleId) : new Set<string>();
  return evaluateRecordAuthorization({ user, permissions, ...args });
}

/**
 * For pages: redirects signed-out and not-yet-active accounts to where they belong, and shows
 * "not found" (never "forbidden") when the role lacks a key.
 */
export async function requirePermission(required: RequiredPermissions = null) {
  const result = await authorize(required);
  if (result.ok) return result;
  if (result.reason === "signed_out") redirect("/sign-in");
  if (result.reason === "account_not_active") redirect(result.redirectTo);
  notFound();
}
