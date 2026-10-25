import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dropEverything, RESET_STATEMENTS } from "../../scripts/lib/reset-database";
import { auditLogs, users } from "@/server/db/schema";
import { insertUser } from "../helpers/factories";
import { createTestDb, type TestDb } from "../helpers/test-db";

// npm run db:reset must be able to wipe a database that holds audit rows (which can never be deleted
// row by row) and rebuild it from the migrations. Run here on PGlite; the guard is tested separately.

let db: TestDb;
let client: Awaited<ReturnType<typeof createTestDb>>["client"];

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  client = test.client;
});

afterAll(async () => {
  await client.close();
});

describe("dropEverything()", () => {
  it("drops the schema, then the migrations rebuild an empty database, append-only trigger included", async () => {
    const actor = await insertUser(db);
    await db
      .insert(auditLogs)
      .values({ actorId: actor.id, action: "user.approved", targetType: "user" });
    expect(await db.select().from(users)).toHaveLength(1);

    await dropEverything(client);
    await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });

    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(auditLogs)).toHaveLength(0);

    // The rebuilt table is append-only again.
    const another = await insertUser(db);
    await db
      .insert(auditLogs)
      .values({ actorId: another.id, action: "user.rejected", targetType: "user" });
    await expect(db.execute(sql`delete from audit_logs`)).rejects.toThrow();
  });

  it("only drops the two schemas it names and recreates public", () => {
    expect(RESET_STATEMENTS).toEqual([
      "DROP SCHEMA IF EXISTS drizzle CASCADE",
      "DROP SCHEMA IF EXISTS public CASCADE",
      "CREATE SCHEMA public",
    ]);
  });
});
