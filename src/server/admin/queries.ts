import "server-only";
import { desc, eq } from "drizzle-orm";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { roles, users } from "@/server/db/schema";
import type { UserTarget } from "@/server/admin/policy";
import type { RecordScope } from "@/server/policies/evaluate-record";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  username: string | null;
  status: "pending" | "active" | "rejected" | "deactivated";
  requestedRole: "student" | "faculty" | null;
  roleKey: string | null;
  rejectionReason: string | null;
  isSeed: boolean;
  createdAt: Date;
};

const USER_LIST_LIMIT = 200;

/** Either the database or a transaction on it: both can run the same select. */
type Executor = Pick<typeof db, "select">;

/**
 * One account, with only the columns the Admin rules and commands use (no password data).
 * Used by the commands inside their transaction (scoping is done by the caller's check) and by
 * loadUserForAdmin() below.
 */
export async function findUserTarget(
  executor: Executor,
  userId: string,
): Promise<UserTarget | null> {
  const [row] = await executor
    .select({
      id: users.id,
      status: users.status,
      username: users.username,
      emailVerified: users.emailVerified,
      requestedRole: users.requestedRole,
      rejectionReason: users.rejectionReason,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

/**
 * The record loader for the Admin users actions. The scope is the permission itself: only a role that
 * holds admin.users.manage can look an account up by id, and anyone else gets nothing (the same
 * answer as "no such account"). Admin may see every account, which is tier 2 data; personal tasks and
 * trackers are never part of this record.
 */
export async function loadUserForAdmin(
  scope: RecordScope,
  userId: string,
): Promise<UserTarget | null> {
  if (!scope.permissions.has("admin.users.manage")) return null;
  return findUserTarget(db, userId);
}

/**
 * The user list for the Admin users page. The caller has run authorize() with admin.users.manage.
 * Only the columns the page shows are selected (no password hash, no tokens).
 */
export async function listUsersForAdmin(
  _actor: CurrentUser,
  filter: { status?: AdminUserRow["status"] } = {},
): Promise<AdminUserRow[]> {
  // Admin may list users (tier 2 account data). Personal tasks and trackers are never joined here.
  const query = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      username: users.username,
      status: users.status,
      requestedRole: users.requestedRole,
      roleKey: roles.key,
      rejectionReason: users.rejectionReason,
      isSeed: users.isSeed,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id));

  const rows = await (filter.status ? query.where(eq(users.status, filter.status)) : query)
    .orderBy(desc(users.createdAt))
    .limit(USER_LIST_LIMIT);

  return rows;
}
