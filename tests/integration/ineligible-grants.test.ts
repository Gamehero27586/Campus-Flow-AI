import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPermissionGrid } from "@/server/admin/permission-grid";
import { readPermissionKeys } from "@/server/auth/read-permissions";
import { seedBase } from "@/server/auth/seed-base";
import { permissions, rolePermissions, roles } from "@/server/db/schema";
import { evaluateAuthorization } from "@/server/policies/evaluate";
import { actor, makeUser } from "../helpers/permission-harness";
import { createTestDb, type TestDb } from "../helpers/test-db";

// Review L1: a row in role_permissions that the code forbids (a role that may never hold the key, or a
// key the code does not know) must NOT give access, however it got there: by hand in a SQL console, a
// bad migration, or one day a buggy grid editor. The grid still shows it as a problem.

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/server/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

let db: TestDb;
beforeEach(async () => {
  const test = await createTestDb();
  holder.db = test.db;
  db = test.db;
  await seedBase();
});

async function roleId(key: string) {
  const [row] = await db.select().from(roles).where(eq(roles.key, key));
  return row.id;
}

/** Writes a grant straight into the table, the way a stray row would arrive. */
async function grantByHand(roleKey: string, permissionKey: string) {
  let [permission] = await db.select().from(permissions).where(eq(permissions.key, permissionKey));
  if (!permission) {
    [permission] = await db
      .insert(permissions)
      .values({ key: permissionKey, module: "Test", description: "Added by hand" })
      .returning();
  }
  await db
    .insert(rolePermissions)
    .values({ roleId: await roleId(roleKey), permissionId: permission.id });
}

describe("grants the code forbids are ignored by the server", () => {
  it("Student holding admin.override (an Admin-only key) does not hold it", async () => {
    await grantByHand("student", "admin.override");
    const keys = await readPermissionKeys(await roleId("student"));
    expect(keys.has("admin.override")).toBe(false);
  });

  it("Student holding class.create (Faculty only) does not hold it, and is refused", async () => {
    await grantByHand("student", "class.create");
    const keys = await readPermissionKeys(await roleId("student"));
    expect(keys.has("class.create")).toBe(false);

    const student = actor("student").user;
    expect(evaluateAuthorization(student, keys, "class.create")).toEqual({
      ok: false,
      reason: "missing_permission",
    });
  });

  it("Student holding every admin key holds none of them", async () => {
    for (const key of [
      "admin.users.manage",
      "admin.users.assign_role",
      "admin.roles.edit_permissions",
      "admin.audit.view",
      "admin.override",
    ]) {
      await grantByHand("student", key);
    }
    const keys = await readPermissionKeys(await roleId("student"));
    expect([...keys].filter((key) => key.startsWith("admin."))).toEqual([]);
  });

  it("Faculty switched on for personal tasks (eligible, off by default) DOES hold it", async () => {
    // The one kind of extra grant that is legitimate: the role is eligible for the key.
    await grantByHand("faculty", "task.personal.manage");
    const keys = await readPermissionKeys(await roleId("faculty"));
    expect(keys.has("task.personal.manage")).toBe(true);
  });

  it("a key the code does not know is ignored, even for Admin", async () => {
    await grantByHand("admin", "made.up.key");
    const keys = await readPermissionKeys(await roleId("admin"));
    expect(keys.has("made.up.key")).toBe(false);
  });

  it("ignoring stray grants does not take away the real ones", async () => {
    await grantByHand("student", "admin.override");
    const keys = await readPermissionKeys(await roleId("student"));
    expect(keys.has("dashboard.view")).toBe(true);
    expect(keys.has("class.join")).toBe(true);
    expect(keys.has("submission.create")).toBe(true);
  });

  it("a student with a stray admin grant is still refused the Admin page and Admin approval", async () => {
    await grantByHand("student", "admin.users.manage");
    await grantByHand("student", "admin.users.assign_role");
    const keys = await readPermissionKeys(await roleId("student"));
    const student = makeUser({ roleKey: "student" });
    expect(evaluateAuthorization(student, keys, "admin.users.manage").ok).toBe(false);
    expect(
      evaluateAuthorization(student, keys, ["admin.users.manage", "admin.users.assign_role"]).ok,
    ).toBe(false);
  });
});

describe("the grid still reports the stray rows as problems", () => {
  it("shows an ineligible grant as a problem", async () => {
    await grantByHand("student", "admin.override");
    const grid = await loadPermissionGrid();
    expect(grid.warnings.join(" ")).toMatch(/student holds admin\.override/);
    expect(grid.rows.find((row) => row.key === "admin.override")!.cells.student).toBe(
      "ineligible_grant",
    );
  });

  it("shows an unknown key as a problem", async () => {
    await grantByHand("admin", "made.up.key");
    const grid = await loadPermissionGrid();
    expect(grid.warnings.join(" ")).toMatch(/made\.up\.key.*not a known permission key/);
  });
});
