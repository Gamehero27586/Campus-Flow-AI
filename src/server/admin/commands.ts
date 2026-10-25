import "server-only";
import { and, eq } from "drizzle-orm";
import { fail, type Failure, ok } from "@/lib/result";
import { now } from "@/lib/time";
import {
  ACTIVATION_FROM,
  activationRules,
  type ActivationMode,
  type ApproveInput,
  type RejectInput,
  rejectionRules,
  resetToPendingRules,
  type UserTarget,
} from "@/server/admin/policy";
import { findUserTarget } from "@/server/admin/queries";
import { writeAudit } from "@/server/audit/write-audit";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { roles, users } from "@/server/db/schema";
import { decisionToFailure } from "@/server/policies/decision";
import { type RecordRules, runRules } from "@/server/policies/evaluate-record";

// Writes for the Admin users page. The caller (a server action) has already run authorizeRecord():
// admin.users.manage to reject or move back to pending, and that plus admin.users.assign_role to
// approve or reapprove (both set a role). The rules themselves are in policy.ts. Each command calls
// them again on the row it reads INSIDE its transaction, so a change made a moment ago is caught,
// and then writes with a conditional UPDATE ... WHERE status = ..., so two Admins clicking at once
// cannot both win.

export type { ApproveInput, RejectInput };

// The Admin rules do not read permissions (the action already checked the keys), so the commands pass none.
const NO_PERMISSIONS: ReadonlySet<string> = new Set();

type Checked = { ok: false; failure: Failure } | { ok: true; target: UserTarget };

/** Reads the target and applies a rule set. Returns the target, or the failure to hand back. */
async function checkTarget(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actor: CurrentUser,
  userId: string,
  rules: RecordRules<UserTarget>,
): Promise<Checked> {
  const target = await findUserTarget(tx, userId);
  if (!target) return { ok: false, failure: fail("not_found", "That account was not found.") };
  const decision = runRules(rules, { user: actor, permissions: NO_PERMISSIONS, record: target });
  if (!decision.allow) return { ok: false, failure: decisionToFailure(decision) };
  return { ok: true, target };
}

async function activateAccount(actor: CurrentUser, input: ApproveInput, mode: ActivationMode) {
  const from = ACTIVATION_FROM[mode];

  return db.transaction(async (tx) => {
    const checked = await checkTarget(tx, actor, input.userId, activationRules(input, mode));
    if (!checked.ok) return checked.failure;
    const { target } = checked;

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
      .where(and(eq(users.id, target.id), eq(users.status, from)))
      .returning({ id: users.id });
    if (updated.length === 0) {
      return fail(
        mode === "approve" ? "not_pending" : "not_rejected",
        mode === "approve"
          ? "That account is not waiting for approval."
          : "That account is not in the rejected list.",
      );
    }

    await writeAudit(tx, {
      actorId: actor.id,
      action: mode === "approve" ? "user.approved" : "user.reapproved",
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

export async function rejectUser(actor: CurrentUser, input: RejectInput) {
  return db.transaction(async (tx) => {
    const checked = await checkTarget(tx, actor, input.userId, rejectionRules());
    if (!checked.ok) return checked.failure;
    const { target } = checked;

    const updated = await tx
      .update(users)
      .set({ status: "rejected", rejectionReason: input.reason })
      .where(and(eq(users.id, target.id), eq(users.status, "pending")))
      .returning({ id: users.id });
    if (updated.length === 0) {
      return fail("not_pending", "That account is not waiting for approval.");
    }

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
  return db.transaction(async (tx) => {
    const checked = await checkTarget(tx, actor, input.userId, resetToPendingRules());
    if (!checked.ok) return checked.failure;
    const { target } = checked;

    const updated = await tx
      .update(users)
      .set({ status: "pending", rejectionReason: null })
      .where(and(eq(users.id, target.id), eq(users.status, "rejected")))
      .returning({ id: users.id });
    if (updated.length === 0) {
      return fail("not_rejected", "That account is not in the rejected list.");
    }

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
