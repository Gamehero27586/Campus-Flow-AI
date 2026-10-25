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
import { authorize } from "@/server/policies/authorize";

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

  // Approving sets a role, so it needs both keys (docs/data-flows.md §6). Rejecting needs only the first.
  const authorization = await authorize(["admin.users.manage", "admin.users.assign_role"]);
  if (!authorization.ok) return fail("not_allowed", "You cannot do that.");

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

  const authorization = await authorize(["admin.users.manage", "admin.users.assign_role"]);
  if (!authorization.ok) return fail("not_allowed", "You cannot do that.");

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

  const authorization = await authorize("admin.users.manage");
  if (!authorization.ok) return fail("not_allowed", "You cannot do that.");

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

  const authorization = await authorize("admin.users.manage");
  if (!authorization.ok) return fail("not_allowed", "You cannot do that.");

  const result = await rejectUser(authorization.user, parsed.data);
  if (!result.ok) return result;

  revalidatePath("/admin/users");
  return { ok: true, message: "Rejected." };
}
