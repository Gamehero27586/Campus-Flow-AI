import "server-only";
import { eq } from "drizzle-orm";
import { PERMISSIONS, ROLE_KEYS, type RoleKey } from "@/server/auth/permission-keys";
import { db } from "@/server/db/client";
import { permissions as permissionsTable, rolePermissions, roles } from "@/server/db/schema";

// The read-only permission grid (docs/permissions.md §3 and §8): every key against every role.

/**
 * granted       the role holds the key right now
 * eligible_off  the role may hold it, and does not
 * not_possible  the role can never hold it
 * ineligible_grant  the database says granted, but the role is not allowed to hold it (a problem)
 * locked_missing    a locked key is not held by Admin (a problem)
 */
export type GridCell =
  "granted" | "eligible_off" | "not_possible" | "ineligible_grant" | "locked_missing";

export type GridRow = {
  key: string;
  module: string;
  description: string;
  locked: boolean;
  cells: Record<RoleKey, GridCell>;
};

export type PermissionGrid = {
  rows: GridRow[];
  /** Plain-language problems found, empty when the database matches the rules. */
  warnings: string[];
};

/** One granted pair: which role holds which key right now. */
export type Grant = { role: string; permission: string };

/** Pure: builds the grid from the code's definitions and the grants read from the database. */
export function buildPermissionGrid(grants: readonly Grant[]): PermissionGrid {
  const granted = new Set(grants.map((grant) => `${grant.role}|${grant.permission}`));
  const warnings: string[] = [];

  const rows: GridRow[] = PERMISSIONS.map((definition) => {
    const locked = "locked" in definition;
    const cells = {} as Record<RoleKey, GridCell>;

    for (const role of ROLE_KEYS) {
      const holds = granted.has(`${role}|${definition.key}`);
      const eligible = (definition.eligible as readonly string[]).includes(role);

      if (holds && !eligible) {
        cells[role] = "ineligible_grant";
        warnings.push(`${role} holds ${definition.key}, but that role may never hold it.`);
      } else if (locked && role === "admin" && !holds) {
        cells[role] = "locked_missing";
        warnings.push(`Admin does not hold ${definition.key}, which is locked to Admin.`);
      } else if (holds) {
        cells[role] = "granted";
      } else if (eligible) {
        cells[role] = "eligible_off";
      } else {
        cells[role] = "not_possible";
      }
    }

    return {
      key: definition.key,
      module: definition.module,
      description: definition.description,
      locked,
      cells,
    };
  });

  // A grant for a key the code does not define (for example a key removed in a later version).
  const known = new Set<string>(PERMISSIONS.map((definition) => definition.key));
  for (const grant of grants) {
    if (!known.has(grant.permission)) {
      warnings.push(
        `${grant.role} holds ${grant.permission}, which is not a known permission key.`,
      );
    }
  }

  return { rows, warnings };
}

/** Reads every grant from the database. Only role and key names, nothing about people. */
export async function readGrants(): Promise<Grant[]> {
  return db
    .select({ role: roles.key, permission: permissionsTable.key })
    .from(rolePermissions)
    .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissionsTable, eq(rolePermissions.permissionId, permissionsTable.id));
}

/** The caller has already run authorize() with admin.roles.edit_permissions. */
export async function loadPermissionGrid(): Promise<PermissionGrid> {
  return buildPermissionGrid(await readGrants());
}
