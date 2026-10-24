import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@/server/auth/current-user";
import { users } from "@/server/db/schema";
import type { TestDb } from "./test-db";

type NewUser = typeof users.$inferInsert;

/** Inserts a user row directly (the way the seed script does) and returns it. */
export async function insertUser(db: TestDb, overrides: Partial<NewUser> = {}) {
  const id = overrides.id ?? randomUUID();
  const [row] = await db
    .insert(users)
    .values({
      id,
      name: "Person",
      email: `${id}@example.com`,
      username: `user_${id.slice(0, 8)}`,
      ...overrides,
    })
    .returning();
  return row;
}

/** The CurrentUser shape that getCurrentUser() returns, for tests that do not go through a session. */
export function asCurrentUser(
  row: typeof users.$inferSelect,
  roleKey: string | null = null,
): CurrentUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    username: row.username,
    displayUsername: row.displayUsername,
    status: row.status,
    requestedRole: row.requestedRole,
    roleId: row.roleId,
    roleKey,
    timezone: row.timezone,
    rejectionReason: row.rejectionReason,
  };
}
