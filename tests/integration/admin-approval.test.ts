import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  approveUser,
  reapproveUser,
  rejectUser,
  resetRejectedToPending,
} from "@/server/admin/commands";
import { listUsersForAdmin } from "@/server/admin/queries";
import type { CurrentUser } from "@/server/auth/current-user";
import { seedBase } from "@/server/auth/seed-base";
import { db } from "@/server/db/client";
import { auditLogs, roles, users } from "@/server/db/schema";
import { asCurrentUser, insertUser } from "../helpers/factories";
import type { TestDb } from "../helpers/test-db";

vi.mock("@/server/db/client", async () => {
  const { createTestDb } = await import("../helpers/test-db");
  const { db } = await createTestDb();
  return { db };
});

const testDb = db as unknown as TestDb;

let admin: CurrentUser;

beforeAll(async () => {
  await seedBase();
  const [adminRole] = await testDb.select().from(roles).where(eq(roles.key, "admin"));
  const row = await insertUser(testDb, { status: "active", roleId: adminRole.id });
  admin = asCurrentUser(row, "admin");
});

/**
 * Audit rows about one account, oldest first. The audit table is append-only, so tests cannot clear
 * it between cases; each test uses its own accounts and reads only the rows about them.
 */
async function auditAbout(targetId: string) {
  return testDb
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.targetId, targetId))
    .orderBy(auditLogs.createdAt);
}

async function pendingUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  return insertUser(testDb, { status: "pending", emailVerified: true, ...overrides });
}

async function reload(id: string) {
  const [row] = await testDb.select().from(users).where(eq(users.id, id));
  return row;
}

describe("approveUser()", () => {
  it("activates the account with the chosen role and records who approved and when", async () => {
    const target = await pendingUser({ requestedRole: "faculty" });

    const result = await approveUser(admin, {
      userId: target.id,
      role: "student",
      confirmedEmailOwner: false,
    });

    expect(result.ok).toBe(true);
    const after = await reload(target.id);
    const [studentRole] = await testDb.select().from(roles).where(eq(roles.key, "student"));
    expect(after.status).toBe("active");
    // The requested role was "faculty", but the Admin's choice wins: the request is a hint only.
    expect(after.roleId).toBe(studentRole.id);
    expect(after.approvedBy).toBe(admin.id);
    expect(after.approvedAt).not.toBeNull();
  });

  it("writes an audit row with the role chosen and the email state", async () => {
    const target = await pendingUser({ requestedRole: "faculty" });
    await approveUser(admin, { userId: target.id, role: "faculty", confirmedEmailOwner: false });

    const audit = await auditAbout(target.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: admin.id,
      action: "user.approved",
      targetType: "user",
      targetId: target.id,
    });
    expect(audit[0].details).toMatchObject({
      role: "faculty",
      requestedRole: "faculty",
      emailVerified: true,
    });
  });

  it("refuses an unverified email until the Admin confirms ownership, then allows it", async () => {
    const target = await pendingUser({ emailVerified: false });

    const refused = await approveUser(admin, {
      userId: target.id,
      role: "student",
      confirmedEmailOwner: false,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("email_unconfirmed");
    expect((await reload(target.id)).status).toBe("pending");
    expect(await auditAbout(target.id)).toHaveLength(0);

    const allowed = await approveUser(admin, {
      userId: target.id,
      role: "student",
      confirmedEmailOwner: true,
    });
    expect(allowed.ok).toBe(true);
    const audit = await auditAbout(target.id);
    expect(audit[0].details).toMatchObject({ emailVerified: false, confirmedEmailOwner: true });
  });

  it("refuses to approve your own account", async () => {
    const own = await pendingUser();
    const result = await approveUser(asCurrentUser(own), {
      userId: own.id,
      role: "student",
      confirmedEmailOwner: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("self_action");
    expect((await reload(own.id)).status).toBe("pending");
  });

  it("refuses an account that has not chosen a username", async () => {
    const target = await pendingUser({ username: null });
    const result = await approveUser(admin, {
      userId: target.id,
      role: "student",
      confirmedEmailOwner: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("welcome_incomplete");
  });

  it.each(["active", "rejected", "deactivated"] as const)(
    "refuses an account that is already %s",
    async (status) => {
      const target = await pendingUser({ status });
      const result = await approveUser(admin, {
        userId: target.id,
        role: "student",
        confirmedEmailOwner: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("not_pending");
    },
  );

  it("refuses an unknown account", async () => {
    const result = await approveUser(admin, {
      userId: randomUUID(),
      role: "student",
      confirmedEmailOwner: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_found");
  });

  it("a second approval of the same account loses cleanly and writes no second audit row", async () => {
    const target = await pendingUser();
    const input = { userId: target.id, role: "student" as const, confirmedEmailOwner: true };
    const first = await approveUser(admin, input);
    const second = await approveUser(admin, input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(await auditAbout(target.id)).toHaveLength(1);
  });

  it("rolls the approval back if the audit row cannot be written (same transaction)", async () => {
    const target = await pendingUser();
    // An actor who is not in the users table makes the audit insert violate its foreign key.
    const ghost: CurrentUser = { ...admin, id: randomUUID() };

    await expect(
      approveUser(ghost, { userId: target.id, role: "student", confirmedEmailOwner: true }),
    ).rejects.toThrow();

    const after = await reload(target.id);
    expect(after.status).toBe("pending");
    expect(after.roleId).toBeNull();
    expect(after.approvedBy).toBeNull();
  });
});

describe("rejectUser()", () => {
  it("rejects a pending account, stores the reason and writes an audit row", async () => {
    const target = await pendingUser();
    const result = await rejectUser(admin, { userId: target.id, reason: "Not a student here" });

    expect(result.ok).toBe(true);
    const after = await reload(target.id);
    expect(after.status).toBe("rejected");
    expect(after.rejectionReason).toBe("Not a student here");
    expect(after.roleId).toBeNull();

    const audit = await auditAbout(target.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "user.rejected", targetId: target.id });
  });

  it("works without a reason", async () => {
    const target = await pendingUser();
    const result = await rejectUser(admin, { userId: target.id, reason: null });
    expect(result.ok).toBe(true);
    expect((await reload(target.id)).rejectionReason).toBeNull();
  });

  it("refuses to reject your own account", async () => {
    const own = await pendingUser();
    const result = await rejectUser(asCurrentUser(own), { userId: own.id, reason: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("self_action");
  });

  it("refuses an account that is not pending", async () => {
    const target = await pendingUser({ status: "active" });
    const result = await rejectUser(admin, { userId: target.id, reason: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_pending");
    expect((await reload(target.id)).status).toBe("active");
  });
});

describe("reapproveUser() (an account rejected by mistake)", () => {
  async function rejectedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
    return insertUser(testDb, {
      status: "rejected",
      rejectionReason: "Rejected by mistake",
      emailVerified: true,
      ...overrides,
    });
  }

  it("activates the account with the chosen role, clears the reason and records who did it", async () => {
    const target = await rejectedUser();
    const result = await reapproveUser(admin, {
      userId: target.id,
      role: "faculty",
      confirmedEmailOwner: false,
    });

    expect(result.ok).toBe(true);
    const after = await reload(target.id);
    const [facultyRole] = await testDb.select().from(roles).where(eq(roles.key, "faculty"));
    expect(after.status).toBe("active");
    expect(after.roleId).toBe(facultyRole.id);
    expect(after.rejectionReason).toBeNull();
    expect(after.approvedBy).toBe(admin.id);
    expect(after.approvedAt).not.toBeNull();
  });

  it("writes a reapproval audit row that keeps the reason it overrides", async () => {
    const target = await rejectedUser({ rejectionReason: "Wrong email domain" });
    await reapproveUser(admin, { userId: target.id, role: "student", confirmedEmailOwner: false });

    const audit = await auditAbout(target.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: admin.id,
      action: "user.reapproved",
      targetId: target.id,
    });
    expect(audit[0].details).toMatchObject({
      role: "student",
      previousRejectionReason: "Wrong email domain",
    });
  });

  it("still needs the email-ownership confirmation for an unverified email", async () => {
    const target = await rejectedUser({ emailVerified: false });
    const refused = await reapproveUser(admin, {
      userId: target.id,
      role: "student",
      confirmedEmailOwner: false,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("email_unconfirmed");
    expect((await reload(target.id)).status).toBe("rejected");

    const allowed = await reapproveUser(admin, {
      userId: target.id,
      role: "student",
      confirmedEmailOwner: true,
    });
    expect(allowed.ok).toBe(true);
  });

  it.each(["pending", "active", "deactivated"] as const)(
    "refuses an account that is %s, not rejected",
    async (status) => {
      const target = await rejectedUser({ status });
      const result = await reapproveUser(admin, {
        userId: target.id,
        role: "student",
        confirmedEmailOwner: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("not_rejected");
      expect((await reload(target.id)).status).toBe(status);
    },
  );

  it("refuses to reapprove your own account", async () => {
    const own = await rejectedUser();
    const result = await reapproveUser(asCurrentUser(own), {
      userId: own.id,
      role: "student",
      confirmedEmailOwner: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("self_action");
    expect((await reload(own.id)).status).toBe("rejected");
  });

  it("refuses an account with no username and points to moving it back to pending", async () => {
    const target = await rejectedUser({ username: null });
    const result = await reapproveUser(admin, {
      userId: target.id,
      role: "student",
      confirmedEmailOwner: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("welcome_incomplete");
      expect(result.error.message).toMatch(/back to pending/i);
    }
  });

  it("a second reapproval loses cleanly and writes no second audit row", async () => {
    const target = await rejectedUser();
    const input = { userId: target.id, role: "student" as const, confirmedEmailOwner: true };
    const first = await reapproveUser(admin, input);
    const second = await reapproveUser(admin, input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(await auditAbout(target.id)).toHaveLength(1);
  });

  it("rolls back if the audit row cannot be written (same transaction)", async () => {
    const target = await rejectedUser();
    const ghost: CurrentUser = { ...admin, id: randomUUID() };
    await expect(
      reapproveUser(ghost, { userId: target.id, role: "student", confirmedEmailOwner: true }),
    ).rejects.toThrow();
    const after = await reload(target.id);
    expect(after.status).toBe("rejected");
    expect(after.rejectionReason).toBe("Rejected by mistake");
    expect(after.roleId).toBeNull();
  });

  it("does not change what approving a pending account does", async () => {
    const target = await pendingUser();
    const wrong = await reapproveUser(admin, {
      userId: target.id,
      role: "student",
      confirmedEmailOwner: true,
    });
    expect(wrong.ok).toBe(false);
    const right = await approveUser(admin, {
      userId: target.id,
      role: "student",
      confirmedEmailOwner: true,
    });
    expect(right.ok).toBe(true);
    const audit = await auditAbout(target.id);
    expect(audit.map((row) => row.action)).toEqual(["user.approved"]);
  });
});

describe("resetRejectedToPending()", () => {
  it("moves a rejected account back to the pending list and clears the reason", async () => {
    const target = await insertUser(testDb, { status: "rejected", rejectionReason: "Mistake" });
    const result = await resetRejectedToPending(admin, { userId: target.id });

    expect(result.ok).toBe(true);
    const after = await reload(target.id);
    expect(after.status).toBe("pending");
    expect(after.rejectionReason).toBeNull();
    expect(after.roleId).toBeNull();

    const audit = await auditAbout(target.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "user.reset_to_pending", targetId: target.id });
    expect(audit[0].details).toMatchObject({ previousRejectionReason: "Mistake" });
  });

  it("then the account can be approved from the pending list as usual", async () => {
    const target = await insertUser(testDb, { status: "rejected", emailVerified: true });
    await resetRejectedToPending(admin, { userId: target.id });
    const result = await approveUser(admin, {
      userId: target.id,
      role: "student",
      confirmedEmailOwner: false,
    });
    expect(result.ok).toBe(true);
    expect((await reload(target.id)).status).toBe("active");
  });

  it.each(["pending", "active", "deactivated"] as const)(
    "refuses an account that is %s",
    async (status) => {
      const target = await insertUser(testDb, { status });
      const result = await resetRejectedToPending(admin, { userId: target.id });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("not_rejected");
      expect((await reload(target.id)).status).toBe(status);
    },
  );

  it("refuses your own account and an unknown account", async () => {
    const own = await insertUser(testDb, { status: "rejected" });
    const self = await resetRejectedToPending(asCurrentUser(own), { userId: own.id });
    const unknown = await resetRejectedToPending(admin, { userId: randomUUID() });
    expect(self.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    if (!self.ok) expect(self.error.code).toBe("self_action");
    if (!unknown.ok) expect(unknown.error.code).toBe("not_found");
  });
});

describe("listUsersForAdmin()", () => {
  it("filters by status and never returns password or token columns", async () => {
    const target = await pendingUser({ name: "Listed Pending" });
    const rows = await listUsersForAdmin(admin, { status: "pending" });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status === "pending")).toBe(true);
    const row = rows.find((candidate) => candidate.id === target.id)!;
    expect(Object.keys(row).sort()).toEqual(
      [
        "createdAt",
        "email",
        "emailVerified",
        "id",
        "isSeed",
        "name",
        "rejectionReason",
        "requestedRole",
        "roleKey",
        "status",
        "username",
      ].sort(),
    );
  });
});
