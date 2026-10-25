import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promoteFirstAdmin } from "@/server/admin/promote-first-admin";
import { PERMISSIONS } from "@/server/auth/permission-keys";
import { seedBase } from "@/server/auth/seed-base";
import { auditLogs, permissions, rolePermissions, roles, users } from "@/server/db/schema";
import { insertUser } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

// The application's database client is replaced by an in-memory Postgres with the real migrations
// applied. Every test gets its own fresh database: audit_logs is append-only, so a test cannot clear
// it, and users who have acted cannot be deleted.
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/server/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

let closeDb: (() => Promise<void>) | null = null;

async function freshDatabase() {
  const test = await createTestDb();
  holder.db = test.db;
  closeDb = () => test.client.close();
}

afterEach(async () => {
  await closeDb?.();
  closeDb = null;
});

// testDb always points at the current test's database.
const testDb = new Proxy({} as TestDb, {
  get: (_target, property) => {
    const real = holder.db as TestDb;
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
async function grantsByRole() {
  const rows = await testDb
    .select({ role: roles.key, permission: permissions.key })
    .from(rolePermissions)
    .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id));
  const byRole: Record<string, string[]> = { student: [], faculty: [], admin: [] };
  for (const row of rows) byRole[row.role].push(row.permission);
  return byRole;
}

describe("seedBase()", () => {
  beforeEach(freshDatabase);

  it("writes 3 roles, 23 keys and exactly the default grants", async () => {
    const result = await seedBase();
    expect(result.roles).toBe(3);
    expect(result.permissions).toBe(23);

    const expected: Record<string, string[]> = { student: [], faculty: [], admin: [] };
    for (const permission of PERMISSIONS) {
      for (const role of permission.defaults) expected[role].push(permission.key);
    }
    const actual = await grantsByRole();
    for (const role of ["student", "faculty", "admin"]) {
      expect(actual[role].sort(), role).toEqual(expected[role].sort());
    }
    expect(result.grantsAdded).toBe(34);
  });

  it("is safe to run twice and adds nothing the second time", async () => {
    await seedBase();
    const second = await seedBase();
    expect(second.grantsAdded).toBe(0);
    const rows = await testDb.select().from(rolePermissions);
    expect(rows).toHaveLength(34);
  });

  it("does not undo a grant an Admin removed from a key that other roles still hold", async () => {
    await seedBase();
    const [faculty] = await testDb.select().from(roles).where(eq(roles.key, "faculty"));
    const [key] = await testDb
      .select()
      .from(permissions)
      .where(eq(permissions.key, "dashboard.view"));
    await testDb
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.roleId, faculty.id), eq(rolePermissions.permissionId, key.id)));

    await seedBase();

    const actual = await grantsByRole();
    expect(actual.faculty).not.toContain("dashboard.view");
    expect(actual.student).toContain("dashboard.view");
  });

  it("gives Student no admin key and Faculty no student-only key", async () => {
    await seedBase();
    const actual = await grantsByRole();
    expect(actual.student.filter((key) => key.startsWith("admin."))).toEqual([]);
    expect(actual.faculty.filter((key) => key.startsWith("admin."))).toEqual([]);
    expect(actual.faculty).not.toContain("submission.create");
    expect(actual.faculty).not.toContain("class.join");
  });
});

describe("promoteFirstAdmin() (npm run admin:promote)", () => {
  beforeEach(freshDatabase);

  it("refuses when the roles are not seeded", async () => {
    await insertUser(testDb, { email: "owner@example.com" });
    const result = await promoteFirstAdmin("owner@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("roles_missing");
  });

  it("refuses an email that has no account", async () => {
    await seedBase();
    const result = await promoteFirstAdmin("nobody@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("user_not_found");
  });

  it("makes the account an active Admin and writes an audit row in the same step", async () => {
    await seedBase();
    const owner = await insertUser(testDb, { email: "owner@example.com", status: "pending" });

    const result = await promoteFirstAdmin("  Owner@Example.com ");
    expect(result.ok).toBe(true);

    const [after] = await testDb.select().from(users).where(eq(users.id, owner.id));
    const [adminRole] = await testDb.select().from(roles).where(eq(roles.key, "admin"));
    expect(after.status).toBe("active");
    expect(after.roleId).toBe(adminRole.id);
    expect(after.approvedBy).toBe(owner.id);
    expect(after.approvedAt).not.toBeNull();

    const audit = await testDb.select().from(auditLogs);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: owner.id,
      action: "user.promoted_to_admin",
      targetType: "user",
      targetId: owner.id,
    });
    expect(audit[0].details).toMatchObject({ via: "admin:promote" });
  });

  it("refuses when an active Admin already exists, and changes nothing", async () => {
    await seedBase();
    await insertUser(testDb, { email: "first@example.com" });
    await insertUser(testDb, { email: "second@example.com" });
    await promoteFirstAdmin("first@example.com");

    const result = await promoteFirstAdmin("second@example.com");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("admin_exists");
    const [second] = await testDb.select().from(users).where(eq(users.email, "second@example.com"));
    expect(second.roleId).toBeNull();
    expect(second.status).toBe("pending");
    expect(await testDb.select().from(auditLogs)).toHaveLength(1);
  });
});
