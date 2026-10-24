import "server-only";
import { and, eq } from "drizzle-orm";
import { fail, ok } from "@/lib/result";
import { now } from "@/lib/time";
import { writeAudit } from "@/server/audit/write-audit";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { roles, users } from "@/server/db/schema";

// Writes for the Admin users page. The caller (a server action) has already run authorize():
// admin.users.manage to reject, and that plus admin.users.assign_role to approve (approval sets a
// role). These commands still enforce the rules that do not depend on the role.

export type ApproveInput = {
  userId: string;
  /** Approval offers Student and Faculty. Making someone Admin is a separate action (Slice 10). */
  role: "student" | "faculty";
  /** Required when the account's email is not verified (the Admin has checked with the person). */
  confirmedEmailOwner: boolean;
};

export async function approveUser(actor: CurrentUser, input: ApproveInput) {
  // Rule 4 in permissions.md §6: nobody approves themselves.
  if (input.userId === actor.id) {
    return fail("self_action", "You cannot approve your own account.");
  }

  return db.transaction(async (tx) => {
    // Only the columns this command uses (no password data, no unrelated fields).
    const [target] = await tx
      .select({
        id: users.id,
        status: users.status,
        username: users.username,
        emailVerified: users.emailVerified,
        requestedRole: users.requestedRole,
      })
      .from(users)
      .where(eq(users.id, input.userId));
    if (!target) return fail("not_found", "That account was not found.");
    if (target.status !== "pending")
      return fail("not_pending", "That account is not waiting for approval.");
    if (!target.username) {
      return fail("welcome_incomplete", "That person has not chosen a username yet.");
    }
    if (!target.emailVerified && !input.confirmedEmailOwner) {
      return fail(
        "email_unconfirmed",
        "This email is not verified. Confirm that you have checked the person owns it.",
      );
    }

    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, input.role));
    if (!role) return fail("role_missing", "That role does not exist. Run npm run seed:base.");

    // The status condition makes a second click or a second Admin lose cleanly.
    const updated = await tx
      .update(users)
      .set({
        status: "active",
        roleId: role.id,
        approvedBy: actor.id,
        approvedAt: now(),
        rejectionReason: null,
      })
      .where(and(eq(users.id, target.id), eq(users.status, "pending")))
      .returning({ id: users.id });
    if (updated.length === 0)
      return fail("not_pending", "That account is not waiting for approval.");

    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.approved",
      targetType: "user",
      targetId: target.id,
      details: {
        role: input.role,
        requestedRole: target.requestedRole,
        emailVerified: target.emailVerified,
        confirmedEmailOwner: input.confirmedEmailOwner,
      },
    });

    return ok();
  });
}

export type RejectInput = { userId: string; reason: string | null };

export async function rejectUser(actor: CurrentUser, input: RejectInput) {
  if (input.userId === actor.id) {
    return fail("self_action", "You cannot reject your own account.");
  }

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id, status: users.status, requestedRole: users.requestedRole })
      .from(users)
      .where(eq(users.id, input.userId));
    if (!target) return fail("not_found", "That account was not found.");
    if (target.status !== "pending")
      return fail("not_pending", "That account is not waiting for approval.");

    const updated = await tx
      .update(users)
      .set({ status: "rejected", rejectionReason: input.reason })
      .where(and(eq(users.id, target.id), eq(users.status, "pending")))
      .returning({ id: users.id });
    if (updated.length === 0)
      return fail("not_pending", "That account is not waiting for approval.");

    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.rejected",
      targetType: "user",
      targetId: target.id,
      details: { reason: input.reason, requestedRole: target.requestedRole },
    });

    return ok();
  });
}
