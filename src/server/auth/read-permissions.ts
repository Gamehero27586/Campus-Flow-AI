import "server-only";
import { eq } from "drizzle-orm";
import { PERMISSIONS } from "@/server/auth/permission-keys";
import { db } from "@/server/db/client";
import { permissions, rolePermissions, roles } from "@/server/db/schema";

// For each key the code knows, the roles that may ever hold it (docs/permissions.md §3).
const ELIGIBLE_ROLES = new Map<string, readonly string[]>(
  PERMISSIONS.map((definition) => [definition.key, definition.eligible]),
);

/**
 * The permission keys a role holds, read from the database right now. No caching here, so a grant
 * removed a moment ago is gone on the next call (docs/permissions.md §1 rule 6). The per-request
 * wrapper is in load-permissions.ts.
 *
 * A row in role_permissions is honoured ONLY if the key exists in code AND the role is eligible
 * for it. A stray row (added by hand, by a bad migration, or one day by a buggy grid editor) that
 * gives Student `admin.override` is ignored here; the permission grid still shows it as a problem.
 * The code, not the database, has the last word on who may ever hold a key (review L1).
 */
export async function readPermissionKeys(roleId: string | null): Promise<ReadonlySet<string>> {
  if (!roleId) return new Set();

  const rows = await db
    .select({ key: permissions.key, roleKey: roles.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
    .where(eq(rolePermissions.roleId, roleId));

  return new Set(
    rows.filter((row) => ELIGIBLE_ROLES.get(row.key)?.includes(row.roleKey)).map((row) => row.key),
  );
}
