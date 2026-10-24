import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/server/db/client";
import { permissions, rolePermissions } from "@/server/db/schema";

/** The permission keys a role holds right now. Read per request, never stored in the session. */
export const loadPermissionKeys = cache(
  async (roleId: string | null): Promise<ReadonlySet<string>> => {
    if (!roleId) return new Set();
    const rows = await db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
    return new Set(rows.map((row) => row.key));
  },
);
