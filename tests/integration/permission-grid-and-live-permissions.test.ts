import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPermissionGrid,
  loadPermissionGrid,
  type Grant,
} from "@/server/admin/permission-grid";
import { PERMISSIONS } from "@/server/auth/permission-keys";
import { readPermissionKeys } from "@/server/auth/read-permissions";
import { seedBase } from "@/server/auth/seed-base";
import { permissions, rolePermissions, roles, users } from "@/server/db/schema";
import { evaluateAuthorization } from "@/server/policies/evaluate";
import { asCurrentUser, insertUser } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

// A fresh in-memory database for every test (audit_logs is append-only, so nothing is cleared).
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/server/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

let testDb: TestDb;
beforeEach(async () => {
  const test = await createTestDb();
  holder.db = test.db;
  testDb = test.db;
});

async function roleId(key: string) {
  const [row] = await testDb.select().from(roles).where(eq(roles.key, key));
  return row.id;
}

async function removeGrant(roleKey: string, permissionKey: string) {
  const [permission] = await testDb
    .select()
    .from(permissions)
    .where(eq(permissions.key, permissionKey));
  await testDb
    .delete(rolePermissions)
    .where(
      and(
        eq(rolePermissions.roleId, await roleId(roleKey)),
        eq(rolePermissions.permissionId, permission.id),
      ),
    );
}

describe("a permission removed from a role is refused on the very next request", () => {
  it("faculty can grade, then cannot once the grant is removed", async () => {
    await seedBase();
    const facultyRoleId = await roleId("faculty");
    const row = await insertUser(testDb, { status: "active", roleId: facultyRoleId });
    const faculty = asCurrentUser(row, "faculty");

    const before = evaluateAuthorization(
      faculty,
      await readPermissionKeys(facultyRoleId),
      "submission.grade",
    );
    expect(before.ok).toBe(true);

    await removeGrant("faculty", "submission.grade");

    // No new session, no cache: the very next read sees the change.
    const after = evaluateAuthorization(
      faculty,
      await readPermissionKeys(facultyRoleId),
      "submission.grade",
    );
    expect(after).toEqual({ ok: false, reason: "missing_permission" });
  });

  it("a user with no role holds no permission", async () => {
    await seedBase();
    expect((await readPermissionKeys(null)).size).toBe(0);
  });

  it("a deactivated user's existing session is refused at once, whatever their role holds", async () => {
    await seedBase();
    const studentRoleId = await roleId("student");
    const row = await insertUser(testDb, { status: "active", roleId: studentRoleId });
    const keys = await readPermissionKeys(studentRoleId);
    expect(evaluateAuthorization(asCurrentUser(row, "student"), keys, "dashboard.view").ok).toBe(
      true,
    );

    // The account is deactivated; the session cookie is still valid, but status is read every request.
    await testDb.update(users).set({ status: "deactivated" }).where(eq(users.id, row.id));
    const [fresh] = await testDb.select().from(users).where(eq(users.id, row.id));

    const result = evaluateAuthorization(asCurrentUser(fresh, "student"), keys, "dashboard.view");
    expect(result).toMatchObject({ ok: false, reason: "account_not_active" });
  });
});

describe("buildPermissionGrid()", () => {
  const defaultGrants = (): Grant[] =>
    PERMISSIONS.flatMap((permission) =>
      permission.defaults.map((role) => ({ role, permission: permission.key })),
    );

  it("has one row per key and no warnings for the default grants", () => {
    const grid = buildPermissionGrid(defaultGrants());
    expect(grid.rows).toHaveLength(23);
    expect(grid.warnings).toEqual([]);
  });

  it("classifies each cell", () => {
    const row = (key: string) =>
      buildPermissionGrid(defaultGrants()).rows.find((r) => r.key === key)!;
    expect(row("class.create").cells).toEqual({
      student: "not_possible",
      faculty: "granted",
      admin: "not_possible",
    });
    // Faculty may be switched on for personal tasks later, but are off by default.
    expect(row("task.personal.manage").cells).toEqual({
      student: "granted",
      faculty: "eligible_off",
      admin: "not_possible",
    });
    expect(row("dashboard.view").cells).toEqual({
      student: "granted",
      faculty: "granted",
      admin: "granted",
    });
  });

  it("marks exactly the four locked keys", () => {
    const locked = buildPermissionGrid(defaultGrants())
      .rows.filter((r) => r.locked)
      .map((r) => r.key)
      .sort();
    expect(locked).toEqual([
      "admin.override",
      "admin.roles.edit_permissions",
      "admin.users.assign_role",
      "admin.users.manage",
    ]);
  });

  it("warns about a grant to a role that may never hold the key", () => {
    const grid = buildPermissionGrid([
      ...defaultGrants(),
      { role: "student", permission: "class.create" },
    ]);
    expect(grid.warnings.join(" ")).toMatch(/student holds class\.create/);
    expect(grid.rows.find((r) => r.key === "class.create")!.cells.student).toBe("ineligible_grant");
  });

  it("warns when Admin loses a locked key", () => {
    const grants = defaultGrants().filter(
      (g) => !(g.role === "admin" && g.permission === "admin.override"),
    );
    const grid = buildPermissionGrid(grants);
    expect(grid.warnings.join(" ")).toMatch(/Admin does not hold admin\.override/);
    expect(grid.rows.find((r) => r.key === "admin.override")!.cells.admin).toBe("locked_missing");
  });

  it("warns about a grant for a key the code does not know", () => {
    const grid = buildPermissionGrid([
      ...defaultGrants(),
      { role: "faculty", permission: "old.removed.key" },
    ]);
    expect(grid.warnings.join(" ")).toMatch(/old\.removed\.key.*not a known permission key/);
  });
});

describe("loadPermissionGrid() reads the real grants", () => {
  it("shows no warnings right after the seed", async () => {
    await seedBase();
    const grid = await loadPermissionGrid();
    expect(grid.warnings).toEqual([]);
    expect(grid.rows.filter((r) => Object.values(r.cells).includes("granted")).length).toBe(23);
  });

  it("shows a removed grant as eligible but off", async () => {
    await seedBase();
    await removeGrant("faculty", "dashboard.view");
    const row = (await loadPermissionGrid()).rows.find((r) => r.key === "dashboard.view")!;
    expect(row.cells.faculty).toBe("eligible_off");
    expect(row.cells.student).toBe("granted");
  });

  it("flags a locked key taken from Admin", async () => {
    await seedBase();
    await removeGrant("admin", "admin.users.manage");
    const grid = await loadPermissionGrid();
    expect(grid.warnings.join(" ")).toMatch(/Admin does not hold admin\.users\.manage/);
  });
});
