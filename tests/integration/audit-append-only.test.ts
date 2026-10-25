import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogs, users } from "@/server/db/schema";
import { insertUser } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

// audit_logs is append-only (docs/permissions.md §6 rule 7): the database itself refuses to change
// or remove a row, so no application bug or stray query can rewrite history.

let db: TestDb;
let close: () => Promise<void>;
let actorId: string;
let auditId: string;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  close = () => test.client.close();
  const actor = await insertUser(db);
  actorId = actor.id;
  const [row] = await db
    .insert(auditLogs)
    .values({ actorId, action: "user.approved", targetType: "user", targetId: actorId })
    .returning();
  auditId = row.id;
});

afterAll(async () => {
  await close();
});

async function failureOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    // Drizzle wraps the database error; the original is on `cause`.
    const cause = (error as { cause?: Error }).cause;
    return `${(error as Error).message} ${cause?.message ?? ""}`;
  }
  return "";
}

describe("audit_logs is append-only", () => {
  it("still accepts new rows", async () => {
    const [row] = await db
      .insert(auditLogs)
      .values({ actorId, action: "user.rejected", targetType: "user" })
      .returning();
    expect(row.id).toBeDefined();
  });

  it("refuses to change a row", async () => {
    const message = await failureOf(() =>
      db.update(auditLogs).set({ action: "user.rejected" }).where(eq(auditLogs.id, auditId)),
    );
    expect(message).toMatch(/append-only/i);
    const [row] = await db.select().from(auditLogs).where(eq(auditLogs.id, auditId));
    expect(row.action).toBe("user.approved");
  });

  it("refuses to change a row even by raw SQL", async () => {
    const message = await failureOf(() => db.execute(sql`update audit_logs set details = '{}'`));
    expect(message).toMatch(/append-only/i);
  });

  it("refuses to delete a row", async () => {
    const message = await failureOf(() => db.delete(auditLogs).where(eq(auditLogs.id, auditId)));
    expect(message).toMatch(/append-only/i);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.id, auditId))).toHaveLength(1);
  });

  it("refuses to delete every row at once", async () => {
    const message = await failureOf(() => db.delete(auditLogs));
    expect(message).toMatch(/append-only/i);
  });

  it("refuses TRUNCATE", async () => {
    const message = await failureOf(() => db.execute(sql`truncate table audit_logs`));
    expect(message).toMatch(/append-only/i);
    expect((await db.select().from(auditLogs)).length).toBeGreaterThan(0);
  });

  it("keeps a user who has acted: the audit row points at them, so they cannot be deleted", async () => {
    const message = await failureOf(() => db.delete(users).where(eq(users.id, actorId)));
    expect(message).toMatch(/foreign key|violates/i);
    expect(await db.select().from(users).where(eq(users.id, actorId))).toHaveLength(1);
  });

  it("reports which table and operation were refused", async () => {
    const message = await failureOf(() => db.delete(auditLogs));
    expect(message).toContain("audit_logs");
    expect(message).toContain("DELETE");
  });
});
