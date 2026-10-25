import "server-only";
import { and, eq } from "drizzle-orm";
import { fail, ok } from "@/lib/result";
import { now } from "@/lib/time";
import { writeAudit } from "@/server/audit/write-audit";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { roles, users } from "@/server/db/schema";

// Writes for the Admin users page. The caller (a server action) has already run authorize():
// admin.users.manage to reject or move back to pending, and that plus admin.users.assign_role to
// approve or reapprove (both set a role). These commands still enforce the rules that do not depend
// on the role.

export type ApproveInput = {
  userId: string;
  /** Approval offers Student and Faculty. Making someone Admin is a separate action (Slice 10). */
  role: "student" | "faculty";
  /** Required when the account's email is not verified (the Admin has checked with the person). */
  confirmedEmailOwner: boolean;
};

// Approving a pending account and reapproving a rejected one are the same change with a different
// starting status, so they share one code path (and one set of tests).
const ACTIVATION = {
  approve: {
    from: "pending",
    action: "user.approved",
    self: "You cannot approve your own account.",
    wrongStatus: ["not_pending", "That account is not waiting for approval."],
  },
  reapprove: {
    from: "rejected",
    action: "user.reapproved",
    self: "You cannot reapprove your own account.",
    wrongStatus: ["not_rejected", "That account is not in the rejected list."],
  },
} as const;

async function activateAccount(
  actor: CurrentUser,
  input: ApproveInput,
  mode: keyof typeof ACTIVATION,
) {
  const rule = ACTIVATION[mode];
  const [wrongCode, wrongMessage] = rule.wrongStatus;

  // Rule 4 in permissions.md §6: nobody approves themselves.
  if (input.userId === actor.id) return fail("self_action", rule.self);

  return db.transaction(async (tx) => {
    // Only the columns this command uses (no password data, no unrelated fields).
    const [target] = await tx
      .select({
        id: users.id,
        status: users.status,
        username: users.username,
        emailVerified: users.emailVerified,
        requestedRole: users.requestedRole,
        rejectionReason: users.rejectionReason,
      })
      .from(users)
      .where(eq(users.id, input.userId));
    if (!target) return fail("not_found", "That account was not found.");
    if (target.status !== rule.from) return fail(wrongCode, wrongMessage);
    if (!target.username) {
      return fail(
        "welcome_incomplete",
        mode === "reapprove"
          ? "That person has not chosen a username yet. Move them back to pending instead."
          : "That person has not chosen a username yet.",
      );
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
      .where(and(eq(users.id, target.id), eq(users.status, rule.from)))
      .returning({ id: users.id });
    if (updated.length === 0) return fail(wrongCode, wrongMessage);

    await writeAudit(tx, {
      actorId: actor.id,
      action: rule.action,
      targetType: "user",
      targetId: target.id,
      details: {
        role: input.role,
        requestedRole: target.requestedRole,
        emailVerified: target.emailVerified,
        confirmedEmailOwner: input.confirmedEmailOwner,
        // A reapproval keeps the reason it overrides, because the column itself is cleared.
        ...(mode === "reapprove" ? { previousRejectionReason: target.rejectionReason } : {}),
      },
    });

    return ok();
  });
}

/** Pending to active. */
export function approveUser(actor: CurrentUser, input: ApproveInput) {
  return activateAccount(actor, input, "approve");
}

/** Rejected to active, for an account that was rejected by mistake. */
export function reapproveUser(actor: CurrentUser, input: ApproveInput) {
  return activateAccount(actor, input, "reapprove");
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

/**
 * Rejected back to pending ("reset a rejected account", docs/permissions.md §8): the person returns
 * to the approval queue and the Admin decides again later. No role is set, so it needs only
 * admin.users.manage.
 */
export async function resetRejectedToPending(actor: CurrentUser, input: { userId: string }) {
  if (input.userId === actor.id) {
    return fail("self_action", "You cannot change your own account.");
  }

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id, status: users.status, rejectionReason: users.rejectionReason })
      .from(users)
      .where(eq(users.id, input.userId));
    if (!target) return fail("not_found", "That account was not found.");
    if (target.status !== "rejected") {
      return fail("not_rejected", "That account is not in the rejected list.");
    }

    const updated = await tx
      .update(users)
      .set({ status: "pending", rejectionReason: null })
      .where(and(eq(users.id, target.id), eq(users.status, "rejected")))
      .returning({ id: users.id });
    if (updated.length === 0)
      return fail("not_rejected", "That account is not in the rejected list.");

    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.reset_to_pending",
      targetType: "user",
      targetId: target.id,
      details: { previousRejectionReason: target.rejectionReason },
    });

    return ok();
  });
}
