import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/server/auth/permission-keys";

// The default grants, eligible roles and locked keys, copied BY HAND from docs/permissions.md §3.
// They are written out here on purpose (not computed from the code), so the code is checked against
// the document and not against itself. If the document changes, change this table in the same commit.
// S = Student, F = Faculty, A = Admin. "also eligible" = may be switched on later, off by default.

const DOCUMENT: Record<string, { defaults: string; alsoEligible?: string; locked?: true }> = {
  "admin.users.manage": { defaults: "A", locked: true },
  "admin.users.assign_role": { defaults: "A", locked: true },
  "admin.roles.edit_permissions": { defaults: "A", locked: true },
  "admin.audit.view": { defaults: "A" },
  "admin.override": { defaults: "A", locked: true },
  "dashboard.view": { defaults: "SFA" },
  "class.create": { defaults: "F" },
  "class.view": { defaults: "SFA" },
  "class.manage": { defaults: "F" },
  "class.members.manage": { defaults: "F" },
  "class.join": { defaults: "S" },
  "assignment.manage": { defaults: "F" },
  "assignment.view": { defaults: "SFA" },
  "submission.create": { defaults: "S" },
  "submission.view": { defaults: "SFA" },
  "submission.grade": { defaults: "F" },
  "task.personal.manage": { defaults: "S", alsoEligible: "F" },
  "team.create": { defaults: "S" },
  "team.use": { defaults: "SA" },
  "file.upload": { defaults: "SF" },
  "tracker.personal.view": { defaults: "S", alsoEligible: "F" },
  "tracker.class.view": { defaults: "FA" },
  "ai.use": { defaults: "S", alsoEligible: "F" },
};

const ROLE_BY_LETTER = { S: "student", F: "faculty", A: "admin" } as const;
const roles = (letters: string) =>
  [...letters].map((letter) => ROLE_BY_LETTER[letter as keyof typeof ROLE_BY_LETTER]).sort();

describe("permission keys match docs/permissions.md §3", () => {
  it("has exactly the 23 documented keys", () => {
    expect(PERMISSIONS.map((permission) => permission.key).sort()).toEqual(
      Object.keys(DOCUMENT).sort(),
    );
  });

  it.each(Object.entries(DOCUMENT))("%s: default roles and eligible roles", (key, expected) => {
    const definition = PERMISSIONS.find((permission) => permission.key === key)!;
    expect([...definition.defaults].sort()).toEqual(roles(expected.defaults));
    expect([...definition.eligible].sort()).toEqual(
      roles(expected.defaults + (expected.alsoEligible ?? "")),
    );
  });

  it("locks exactly the four keys the document locks", () => {
    const locked = PERMISSIONS.filter((permission) => "locked" in permission).map(
      (permission) => permission.key,
    );
    const documented = Object.entries(DOCUMENT)
      .filter(([, value]) => value.locked)
      .map(([key]) => key);
    expect(locked.sort()).toEqual(documented.sort());
    expect(documented).toHaveLength(4);
  });
});
