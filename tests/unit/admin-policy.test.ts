import { describe, expect, it } from "vitest";
import {
  activationRules,
  type ApproveInput,
  rejectionRules,
  resetToPendingRules,
  type UserTarget,
} from "@/server/admin/policy";
import { runRules } from "@/server/policies/evaluate-record";
import { actor, makeUser } from "../helpers/permission-harness";

// The Admin Users rules as tables: target account state x input -> allowed, or the exact refusal.
// The same rules run in the server actions (authorizeRecord) and inside the commands.

const ADMIN = makeUser({ id: "00000000-0000-4000-8000-0000000000a1", roleKey: "admin" });
const OTHER = "00000000-0000-4000-8000-0000000000b2";

const target = (overrides: Partial<UserTarget> = {}): UserTarget => ({
  id: OTHER,
  status: "pending",
  username: "someone",
  emailVerified: true,
  requestedRole: null,
  rejectionReason: null,
  ...overrides,
});

const input = (overrides: Partial<ApproveInput> = {}): ApproveInput => ({
  userId: OTHER,
  role: "student",
  confirmedEmailOwner: false,
  ...overrides,
});

const permissions = actor("admin").permissions;
const check = (rules: ReturnType<typeof activationRules>, record: UserTarget) =>
  runRules(rules, { user: ADMIN, permissions, record });

const refused = (code: string, step: 4 | 5) => ({ allow: false, code, step });

describe("approving a pending account", () => {
  const rules = (overrides?: Partial<ApproveInput>) => activationRules(input(overrides), "approve");

  it.each([
    ["a pending account with a username and a verified email", target(), {}, { allow: true }],
    [
      "an unverified email, with the confirmation ticked",
      target({ emailVerified: false }),
      { confirmedEmailOwner: true },
      { allow: true },
    ],
    [
      "an unverified email, without the confirmation",
      target({ emailVerified: false }),
      {},
      refused("email_unconfirmed", 5),
    ],
    ["no username yet", target({ username: null }), {}, refused("welcome_incomplete", 5)],
    ["already active", target({ status: "active" }), {}, refused("not_pending", 5)],
    [
      "rejected (that is reapproval)",
      target({ status: "rejected" }),
      {},
      refused("not_pending", 5),
    ],
    ["deactivated", target({ status: "deactivated" }), {}, refused("not_pending", 5)],
    ["the actor's own account", target({ id: ADMIN.id }), {}, refused("self_action", 4)],
  ])("%s", (_label, record, overrides, expected) => {
    expect(check(rules(overrides), record)).toMatchObject(expected);
  });

  it("checks the relationship (self) before the state", () => {
    // Own account AND wrong status: the answer is the relationship refusal.
    expect(check(rules(), target({ id: ADMIN.id, status: "active" }))).toMatchObject(
      refused("self_action", 4),
    );
  });

  it("checks status before username before email, in that order", () => {
    expect(
      check(rules(), target({ status: "active", username: null, emailVerified: false })),
    ).toMatchObject(refused("not_pending", 5));
    expect(check(rules(), target({ username: null, emailVerified: false }))).toMatchObject(
      refused("welcome_incomplete", 5),
    );
  });
});

describe("reapproving a rejected account", () => {
  const rules = (overrides?: Partial<ApproveInput>) =>
    activationRules(input(overrides), "reapprove");

  it.each([
    ["a rejected account", target({ status: "rejected" }), {}, { allow: true }],
    ["pending (that is approval)", target({ status: "pending" }), {}, refused("not_rejected", 5)],
    ["active", target({ status: "active" }), {}, refused("not_rejected", 5)],
    ["deactivated", target({ status: "deactivated" }), {}, refused("not_rejected", 5)],
    [
      "rejected with no username",
      target({ status: "rejected", username: null }),
      {},
      refused("welcome_incomplete", 5),
    ],
    [
      "rejected, unverified email, not confirmed",
      target({ status: "rejected", emailVerified: false }),
      {},
      refused("email_unconfirmed", 5),
    ],
    [
      "rejected, unverified email, confirmed",
      target({ status: "rejected", emailVerified: false }),
      { confirmedEmailOwner: true },
      { allow: true },
    ],
    [
      "the actor's own rejected account",
      target({ id: ADMIN.id, status: "rejected" }),
      {},
      refused("self_action", 4),
    ],
  ])("%s", (_label, record, overrides, expected) => {
    expect(check(rules(overrides), record)).toMatchObject(expected);
  });

  it("points a rejected account with no username at moving it back to pending", () => {
    const decision = check(rules(), target({ status: "rejected", username: null }));
    expect(decision).toMatchObject({ allow: false });
    if (!decision.allow) expect(decision.message).toMatch(/back to pending/i);
  });
});

describe("rejecting an account", () => {
  it.each([
    ["a pending account", target(), { allow: true }],
    [
      "a pending account with no username (it can still be rejected)",
      target({ username: null }),
      { allow: true },
    ],
    ["an active account", target({ status: "active" }), refused("not_pending", 5)],
    ["an already rejected account", target({ status: "rejected" }), refused("not_pending", 5)],
    ["a deactivated account", target({ status: "deactivated" }), refused("not_pending", 5)],
    ["the actor's own account", target({ id: ADMIN.id }), refused("self_action", 4)],
  ])("%s", (_label, record, expected) => {
    expect(check(rejectionRules(), record)).toMatchObject(expected);
  });
});

describe("moving a rejected account back to pending", () => {
  it.each([
    ["a rejected account", target({ status: "rejected" }), { allow: true }],
    [
      "a rejected account with no username",
      target({ status: "rejected", username: null }),
      { allow: true },
    ],
    ["a pending account", target({ status: "pending" }), refused("not_rejected", 5)],
    ["an active account", target({ status: "active" }), refused("not_rejected", 5)],
    ["a deactivated account", target({ status: "deactivated" }), refused("not_rejected", 5)],
    [
      "the actor's own account",
      target({ id: ADMIN.id, status: "rejected" }),
      refused("self_action", 4),
    ],
  ])("%s", (_label, record, expected) => {
    expect(check(resetToPendingRules(), record)).toMatchObject(expected);
  });
});
