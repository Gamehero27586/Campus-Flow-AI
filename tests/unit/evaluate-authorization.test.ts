import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";
import { evaluateAuthorization } from "@/server/policies/evaluate";

// Steps 1 to 3 of the pipeline: signed in, account active, role holds the key.
// (Steps 4 and 5, relationship and record state, are added with the Slice 2 harness.)

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Test",
    email: "test@example.com",
    emailVerified: true,
    username: "test",
    displayUsername: "Test",
    status: "active",
    requestedRole: null,
    roleId: "role-1",
    roleKey: "student",
    timezone: "Asia/Kolkata",
    rejectionReason: null,
    ...overrides,
  };
}

const keys = (...list: string[]) => new Set(list);

describe("evaluateAuthorization()", () => {
  it("signed out: refused at step 1", () => {
    expect(evaluateAuthorization(null, keys("dashboard.view"), "dashboard.view")).toEqual({
      ok: false,
      reason: "signed_out",
    });
  });

  it.each([
    ["pending", { status: "pending" as const }, "/pending"],
    ["pending without a username", { status: "pending" as const, username: null }, "/welcome"],
    ["rejected", { status: "rejected" as const }, "/pending"],
    ["deactivated (existing session)", { status: "deactivated" as const }, "/pending"],
    ["active but no username", { username: null }, "/welcome"],
  ])("%s: refused at step 2, even if the role holds the key", (_label, overrides, redirectTo) => {
    expect(
      evaluateAuthorization(user(overrides), keys("dashboard.view"), "dashboard.view"),
    ).toEqual({ ok: false, reason: "account_not_active", redirectTo });
  });

  it("pending user opens the dashboard: denied", () => {
    const result = evaluateAuthorization(
      user({ status: "pending", roleId: null, roleKey: null }),
      keys(),
      "dashboard.view",
    );
    expect(result.ok).toBe(false);
  });

  it("active user whose role lacks the key: refused at step 3", () => {
    expect(evaluateAuthorization(user(), keys("dashboard.view"), "admin.users.manage")).toEqual({
      ok: false,
      reason: "missing_permission",
    });
  });

  it("a permission removed from the role is refused on the very next evaluation", () => {
    const before = evaluateAuthorization(user(), keys("submission.grade"), "submission.grade");
    const after = evaluateAuthorization(user(), keys(), "submission.grade");
    expect(before.ok).toBe(true);
    expect(after).toEqual({ ok: false, reason: "missing_permission" });
  });

  it("active user with the key: allowed", () => {
    const result = evaluateAuthorization(
      user({ roleKey: "admin" }),
      keys("admin.users.manage"),
      "admin.users.manage",
    );
    expect(result.ok).toBe(true);
  });

  describe("an action that needs several keys (approving: users.manage AND assign_role)", () => {
    const APPROVE = ["admin.users.manage", "admin.users.assign_role"] as const;
    const admin = () => user({ roleKey: "admin" });

    it("allows a role holding both keys", () => {
      const result = evaluateAuthorization(
        admin(),
        keys("admin.users.manage", "admin.users.assign_role"),
        APPROVE,
      );
      expect(result.ok).toBe(true);
    });

    it("refuses a role holding only admin.users.manage", () => {
      expect(evaluateAuthorization(admin(), keys("admin.users.manage"), APPROVE)).toEqual({
        ok: false,
        reason: "missing_permission",
      });
    });

    it("refuses a role holding only admin.users.assign_role", () => {
      expect(evaluateAuthorization(admin(), keys("admin.users.assign_role"), APPROVE)).toEqual({
        ok: false,
        reason: "missing_permission",
      });
    });

    it("still refuses an account that is not active, even with both keys", () => {
      const result = evaluateAuthorization(
        user({ status: "pending" }),
        keys("admin.users.manage", "admin.users.assign_role"),
        APPROVE,
      );
      expect(result).toMatchObject({ ok: false, reason: "account_not_active" });
    });

    it("rejecting stays on one key: manage alone is enough", () => {
      expect(
        evaluateAuthorization(admin(), keys("admin.users.manage"), "admin.users.manage").ok,
      ).toBe(true);
    });

    it("an empty list requires nothing", () => {
      expect(evaluateAuthorization(user(), keys(), []).ok).toBe(true);
    });
  });

  it("no key required: any active account passes (settings)", () => {
    expect(evaluateAuthorization(user({ roleId: null, roleKey: null }), keys(), null).ok).toBe(
      true,
    );
  });
});
