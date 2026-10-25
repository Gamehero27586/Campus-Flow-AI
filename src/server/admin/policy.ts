import "server-only";
import { allow, notAllowed, stateForbids } from "@/server/policies/decision";
import type { RecordRules } from "@/server/policies/evaluate-record";

// The rules for the Admin Users page (docs/permissions.md §6 and §8), written once. The record here
// is another person's account. Each rule set answers two questions, as every domain's policy.ts does:
//   relationship (step 4): may this actor act on THIS account at all?  (not on their own)
//   state        (step 5): is the account in the right state for this action?
// The server actions run these through authorizeRecord(); the commands call the same functions again
// inside their transaction, on the row they just read, so a change a moment ago is caught too. The
// conditional UPDATE ... WHERE status = ... in each command is the last line against two Admins
// clicking at once: it is race protection, not a second copy of the rule.

export type UserTarget = {
  id: string;
  status: "pending" | "active" | "rejected" | "deactivated";
  username: string | null;
  emailVerified: boolean;
  requestedRole: "student" | "faculty" | null;
  rejectionReason: string | null;
};

export type ApproveInput = {
  userId: string;
  /** Approval offers Student and Faculty. Making someone Admin is a separate action (Slice 10). */
  role: "student" | "faculty";
  /** Required when the account's email is not verified (the Admin has checked with the person). */
  confirmedEmailOwner: boolean;
};

export type RejectInput = { userId: string; reason: string | null };

export type ActivationMode = "approve" | "reapprove";

/** The status an account must have before it can be activated, by mode. */
export const ACTIVATION_FROM = { approve: "pending", reapprove: "rejected" } as const;

const ACTIVATION = {
  approve: {
    self: "You cannot approve your own account.",
    wrongStatus: ["not_pending", "That account is not waiting for approval."],
  },
  reapprove: {
    self: "You cannot reapprove your own account.",
    wrongStatus: ["not_rejected", "That account is not in the rejected list."],
  },
} as const;

/** Pending to active (approve) or rejected to active (reapprove). */
export function activationRules(
  input: ApproveInput,
  mode: ActivationMode,
): RecordRules<UserTarget> {
  const text = ACTIVATION[mode];
  const [wrongCode, wrongMessage] = text.wrongStatus;

  return {
    // Rule 4 in permissions.md §6: nobody approves themselves.
    relationship: ({ user, record }) =>
      record.id === user.id ? notAllowed("self_action", text.self) : allow,

    state: ({ record }) => {
      if (record.status !== ACTIVATION_FROM[mode]) return stateForbids(wrongCode, wrongMessage);
      if (!record.username) {
        return stateForbids(
          "welcome_incomplete",
          mode === "reapprove"
            ? "That person has not chosen a username yet. Move them back to pending instead."
            : "That person has not chosen a username yet.",
        );
      }
      if (!record.emailVerified && !input.confirmedEmailOwner) {
        return stateForbids(
          "email_unconfirmed",
          "This email is not verified. Confirm that you have checked the person owns it.",
        );
      }
      return allow;
    },
  };
}

/** Pending to rejected. */
export function rejectionRules(): RecordRules<UserTarget> {
  return {
    relationship: ({ user, record }) =>
      record.id === user.id
        ? notAllowed("self_action", "You cannot reject your own account.")
        : allow,
    state: ({ record }) =>
      record.status === "pending"
        ? allow
        : stateForbids("not_pending", "That account is not waiting for approval."),
  };
}

/** Rejected back to pending ("reset a rejected account"). */
export function resetToPendingRules(): RecordRules<UserTarget> {
  return {
    relationship: ({ user, record }) =>
      record.id === user.id
        ? notAllowed("self_action", "You cannot change your own account.")
        : allow,
    state: ({ record }) =>
      record.status === "rejected"
        ? allow
        : stateForbids("not_rejected", "That account is not in the rejected list."),
  };
}
