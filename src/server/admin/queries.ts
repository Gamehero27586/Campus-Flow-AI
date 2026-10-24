import "server-only";
import { desc, eq } from "drizzle-orm";
import type { CurrentUser } from "@/server/auth/current-user";
import { db } from "@/server/db/client";
import { roles, users } from "@/server/db/schema";

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
