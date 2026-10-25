import { describe, expect, it } from "vitest";
import {
  ADMIN_WRITE_ACTIONS,
  type AdminWriteAction,
  adminMayRead,
  adminMayWrite,
  type RecordTier,
} from "@/server/policies/admin-access";
import { actor, defaultKeysFor } from "../../helpers/permission-harness";

// What Admin may do with other people's records (docs/permissions.md §5), as tables.

const admin = actor("admin").permissions;
const student = actor("student").permissions;
const faculty = actor("faculty").permissions;

const reads: Array<[string, ReadonlySet<string>, RecordTier, boolean]> = [
  // Tier 1, personal: nobody but the owner. Not even Admin, not even with every key.
  ["Admin", admin, "personal", false],
  [
    "Admin with every key in the system",
    new Set(["admin.override", "admin.users.manage", "tracker.class.view"]),
    "personal",
    false,
  ],
  ["Faculty", faculty, "personal", false],
  ["Student", student, "personal", false],
  // Tier 2, academic: Admin reads (through admin.override).
  ["Admin", admin, "academic", true],
  ["Faculty (class access is a relationship, not this helper)", faculty, "academic", false],
  ["Student", student, "academic", false],
  // Tier 3, team: Admin reads.
  ["Admin", admin, "team", true],
  ["Faculty", faculty, "team", false],
  ["Student", student, "team", false],
];

describe("adminMayRead()", () => {
  it.each(reads)("%s reading a %s-tier record: %s", (_who, permissions, tier, expected) => {
    expect(adminMayRead(permissions, tier)).toBe(expected);
  });

  it("depends on admin.override: an Admin without it reads nothing", () => {
    const withoutOverride = new Set(
      [...defaultKeysFor("admin")].filter((key) => key !== "admin.override"),
    );
    expect(adminMayRead(withoutOverride, "academic")).toBe(false);
    expect(adminMayRead(withoutOverride, "team")).toBe(false);
  });
});

describe("adminMayWrite()", () => {
  it("allows exactly the two transfers", () => {
    expect([...ADMIN_WRITE_ACTIONS].sort()).toEqual([
      "class.transfer_ownership",
      "team.transfer_creator",
    ]);
    expect(adminMayWrite(admin, "class.transfer_ownership")).toBe(true);
    expect(adminMayWrite(admin, "team.transfer_creator")).toBe(true);
  });

  it.each([
    "submission.grade",
    "grade.edit",
    "assignment.edit",
    "assignment.create",
    "submission.create",
    "class.roster.edit",
    "team.task.edit",
    "task.personal.edit",
    "",
  ])("never allows %j (permissions.md §9: Admin edits no grades and submits nothing)", (action) => {
    expect(adminMayWrite(admin, action as AdminWriteAction)).toBe(false);
  });

  it("is refused without admin.override, even for a transfer", () => {
    expect(adminMayWrite(student, "class.transfer_ownership")).toBe(false);
    expect(adminMayWrite(faculty, "team.transfer_creator")).toBe(false);
  });
});
