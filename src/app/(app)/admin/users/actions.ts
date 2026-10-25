"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type FormState } from "@/lib/result";
import {
  approveUser,
  reapproveUser,
  rejectUser,
  resetRejectedToPending,
} from "@/server/admin/commands";
import { activationRules, rejectionRules, resetToPendingRules } from "@/server/admin/policy";
import { loadUserForAdmin } from "@/server/admin/queries";
import { authorizeRecord } from "@/server/policies/authorize";
import { failureFor } from "@/server/policies/evaluate-record";

// Every action here has the same shape (docs/folder-structure.md §4): parse with Zod, run the full
// five-step check on the target account with authorizeRecord(), call ONE command, revalidate, return
// the result. The rules are in src/server/admin/policy.ts.

// Approving and reapproving set a role, so they need both keys (docs/data-flows.md §6).
// Rejecting and moving back to pending set no role, so they need only the first.
const APPROVE_KEYS = ["admin.users.manage", "admin.users.assign_role"] as const;

const resetSchema = z.object({ userId: z.uuid() });

const approveSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["student", "faculty"], "Choose a role."),
  confirmedEmailOwner: z.preprocess((value) => value === "on", z.boolean()),
});

const rejectSchema = z.object({
  userId: z.uuid(),
  reason: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null),
    z.string().max(500, "Use at most 500 characters.").nullable(),
  ),
});

export async function approveUserAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = approveSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    confirmedEmailOwner: formData.get("confirmedEmailOwner"),
  });
  if (!parsed.success) {
    return fail("invalid_input", "Choose a role.", z.flattenError(parsed.error).fieldErrors);
  }

  const authorization = await authorizeRecord({
    required: APPROVE_KEYS,
    loadRecord: (scope) => loadUserForAdmin(scope, parsed.data.userId),
    rules: activationRules(parsed.data, "approve"),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await approveUser(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidatePath("/admin/users");
  return { ok: true, message: "Approved." };
}

/** Rejected to active, for an account rejected by mistake. Same keys as approving. */
export async function reapproveUserAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = approveSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    confirmedEmailOwner: formData.get("confirmedEmailOwner"),
  });
  if (!parsed.success) {
    return fail("invalid_input", "Choose a role.", z.flattenError(parsed.error).fieldErrors);
  }

  const authorization = await authorizeRecord({
    required: APPROVE_KEYS,
    loadRecord: (scope) => loadUserForAdmin(scope, parsed.data.userId),
    rules: activationRules(parsed.data, "reapprove"),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await reapproveUser(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidatePath("/admin/users");
  return { ok: true, message: "Reapproved." };
}

/** Rejected back to the pending list. Sets no role, so it needs only admin.users.manage. */
export async function resetToPendingAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return fail("invalid_input", "That account was not recognised.");

  const authorization = await authorizeRecord({
    required: "admin.users.manage",
    loadRecord: (scope) => loadUserForAdmin(scope, parsed.data.userId),
    rules: resetToPendingRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await resetRejectedToPending(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidatePath("/admin/users");
  return { ok: true, message: "Moved back to pending." };
}

export async function rejectUserAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = rejectSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail("invalid_input", "Check the reason.", z.flattenError(parsed.error).fieldErrors);
  }

  const authorization = await authorizeRecord({
    required: "admin.users.manage",
    loadRecord: (scope) => loadUserForAdmin(scope, parsed.data.userId),
    rules: rejectionRules(),
  });
  if (!authorization.ok) return failureFor(authorization);

  const result = await rejectUser(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidatePath("/admin/users");
  return { ok: true, message: "Rejected." };
}
