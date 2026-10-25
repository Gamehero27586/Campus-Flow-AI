import { describe, expect, it } from "vitest";
import { evaluateAuthorization, type RequiredPermissions } from "@/server/policies/evaluate";
import {
  ALL_ACTING_USER_TYPES,
  type ActingUserType,
  actor,
  defaultKeysFor,
  makeUser,
} from "../../helpers/permission-harness";

// Steps 1 to 3 of the pipeline (docs/permissions.md §2) as a table:
//   acting user type x action x expected result.
// The expected results are written out by hand, one per row.

type Expected = "allowed" | "signed_out" | "account_not_active" | "missing_permission";

const APPROVE = ["admin.users.manage", "admin.users.assign_role"] as const;

const table: Array<[ActingUserType, string, RequiredPermissions, Expected]> = [
  // Dashboard: every active account, nobody who is not active.
  ["signed out", "dashboard", "dashboard.view", "signed_out"],
  ["no username yet", "dashboard", "dashboard.view", "account_not_active"],
  ["pending", "dashboard", "dashboard.view", "account_not_active"], // permissions.md §9: pending opens the dashboard -> denied
  ["rejected", "dashboard", "dashboard.view", "account_not_active"],
  ["deactivated", "dashboard", "dashboard.view", "account_not_active"],
  ["student", "dashboard", "dashboard.view", "allowed"],
  ["faculty", "dashboard", "dashboard.view", "allowed"],
  ["admin", "dashboard", "dashboard.view", "allowed"],

  // Admin pages: Admin only. A rejected or deactivated user is stopped at step 2 even though their
  // role would hold the key.
  ["signed out", "users page", "admin.users.manage", "signed_out"],
  ["pending", "users page", "admin.users.manage", "account_not_active"],
  ["deactivated", "users page", "admin.users.manage", "account_not_active"],
  ["student", "users page", "admin.users.manage", "missing_permission"],
  ["faculty", "users page", "admin.users.manage", "missing_permission"],
  ["admin", "users page", "admin.users.manage", "allowed"],

  ["student", "roles page", "admin.roles.edit_permissions", "missing_permission"],
  ["faculty", "roles page", "admin.roles.edit_permissions", "missing_permission"],
  ["admin", "roles page", "admin.roles.edit_permissions", "allowed"],

  ["student", "admin override", "admin.override", "missing_permission"],
  ["faculty", "admin override", "admin.override", "missing_permission"],
  ["admin", "admin override", "admin.override", "allowed"],

  // Approving needs two keys (data-flows.md §6).
  ["student", "approve a user", APPROVE, "missing_permission"],
  ["faculty", "approve a user", APPROVE, "missing_permission"],
  ["admin", "approve a user", APPROVE, "allowed"],

  // Student actions Admin does not hold, and Faculty actions Student does not hold.
  ["student", "join a class", "class.join", "allowed"],
  ["faculty", "join a class", "class.join", "missing_permission"],
  ["admin", "join a class", "class.join", "missing_permission"],

  ["student", "submit work", "submission.create", "allowed"],
  ["faculty", "submit work", "submission.create", "missing_permission"],
  ["admin", "submit work", "submission.create", "missing_permission"], // Admin cannot submit (permissions.md §9)

  ["student", "create a class", "class.create", "missing_permission"],
  ["faculty", "create a class", "class.create", "allowed"],
  ["admin", "create a class", "class.create", "missing_permission"],

  ["student", "grade", "submission.grade", "missing_permission"],
  ["faculty", "grade", "submission.grade", "allowed"],
  ["admin", "grade", "submission.grade", "missing_permission"], // Admin edits no grades (permissions.md §9)

  // Personal tasks: Faculty are eligible, off by default; Admin never.
  ["student", "personal tasks", "task.personal.manage", "allowed"],
  ["faculty", "personal tasks", "task.personal.manage", "missing_permission"],
  ["admin", "personal tasks", "task.personal.manage", "missing_permission"],

  // Teams: students use them, Admin only views.
  ["student", "teams", "team.use", "allowed"],
  ["faculty", "teams", "team.use", "missing_permission"],
  ["admin", "teams", "team.use", "allowed"],

  // No key needed (Settings): every active account.
  ["signed out", "settings", null, "signed_out"],
  ["pending", "settings", null, "account_not_active"],
  ["rejected", "settings", null, "account_not_active"],
  ["student", "settings", null, "allowed"],
  ["faculty", "settings", null, "allowed"],
  ["admin", "settings", null, "allowed"],
];

function run(type: ActingUserType, required: RequiredPermissions): Expected {
  const { user, permissions } = actor(type);
  const result = evaluateAuthorization(user, permissions, required);
  return result.ok ? "allowed" : result.reason;
}

describe("evaluateAuthorization() as a table", () => {
  it.each(table)("%s, %s: %s", (type, _action, required, expected) => {
    expect(run(type, required)).toBe(expected);
  });

  it("covers every acting user type at least once", () => {
    const covered = new Set(table.map(([type]) => type));
    for (const type of ALL_ACTING_USER_TYPES) expect(covered.has(type), type).toBe(true);
  });
});

describe("account status beats the role (step 2 before step 3)", () => {
  it.each(["pending", "rejected", "deactivated"] as const)(
    "a %s account is refused every key, even keys its role holds",
    (status) => {
      const user = makeUser({ status });
      for (const key of defaultKeysFor("student")) {
        const result = evaluateAuthorization(user, defaultKeysFor("student"), key as never);
        expect(result.ok, `${status} / ${key}`).toBe(false);
        if (!result.ok) expect(result.reason).toBe("account_not_active");
      }
    },
  );

  it("sends each state to the page it belongs on", () => {
    const redirect = (type: ActingUserType) => {
      const { user, permissions } = actor(type);
      const result = evaluateAuthorization(user, permissions, "dashboard.view");
      return !result.ok && result.reason === "account_not_active" ? result.redirectTo : null;
    };
    expect(redirect("no username yet")).toBe("/welcome");
    expect(redirect("pending")).toBe("/pending");
    expect(redirect("rejected")).toBe("/pending");
    expect(redirect("deactivated")).toBe("/pending");
  });
});
