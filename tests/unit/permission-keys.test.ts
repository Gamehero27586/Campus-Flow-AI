import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_KEYS } from "@/server/auth/permission-keys";

// Invariants from docs/permissions.md §3.

describe("permission keys", () => {
  it("has 23 keys and 4 locked keys", () => {
    expect(PERMISSIONS).toHaveLength(23);
    expect(PERMISSIONS.filter((p) => "locked" in p)).toHaveLength(4);
  });

  it("has no duplicate keys", () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only grants by default to roles that are eligible", () => {
    for (const permission of PERMISSIONS) {
      for (const role of permission.defaults) {
        expect(permission.eligible as readonly string[], permission.key).toContain(role);
      }
    }
  });

  it("only mentions the three fixed roles", () => {
    for (const permission of PERMISSIONS) {
      for (const role of [...permission.eligible, ...permission.defaults]) {
        expect(ROLE_KEYS as readonly string[]).toContain(role);
      }
    }
  });

  it("keeps every locked key with Admin, by default and by eligibility", () => {
    for (const permission of PERMISSIONS.filter((p) => "locked" in p)) {
      expect(permission.defaults as readonly string[], permission.key).toContain("admin");
    }
  });

  it("makes every admin.* key eligible for Admin only", () => {
    for (const permission of PERMISSIONS.filter((p) => p.key.startsWith("admin."))) {
      expect(permission.eligible, permission.key).toEqual(["admin"]);
    }
  });

  it("has no key that reads another user's personal tasks, tracker or AI history", () => {
    // Privacy rules are not permissions (permissions.md §1 rule 4). If one of these appears, stop and ask.
    const forbidden = /personal.*(other|any|all)|ai\.history|tracker\.(any|other)/i;
    for (const permission of PERMISSIONS) {
      expect(permission.key).not.toMatch(forbidden);
    }
  });

  it("does not give Admin the student working keys", () => {
    for (const key of [
      "submission.create",
      "class.join",
      "task.personal.manage",
      "ai.use",
      "team.create",
    ]) {
      const permission = PERMISSIONS.find((p) => p.key === key)!;
      expect(permission.eligible as readonly string[], key).not.toContain("admin");
    }
  });

  it("keeps Faculty eligible, but off by default, for personal tasks, tracker and AI", () => {
    for (const key of ["task.personal.manage", "tracker.personal.view", "ai.use"]) {
      const permission = PERMISSIONS.find((p) => p.key === key)!;
      expect(permission.eligible as readonly string[], key).toContain("faculty");
      expect(permission.defaults as readonly string[], key).not.toContain("faculty");
    }
  });
});
