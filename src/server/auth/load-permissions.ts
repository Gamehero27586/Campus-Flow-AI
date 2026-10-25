import "server-only";
import { cache } from "react";
import { readPermissionKeys } from "@/server/auth/read-permissions";

/**
 * The permission keys a role holds, read once per request (React's per-request cache) and never
 * stored in the session (CLAUDE.md security rule 7): the next request reads them again.
 */
export const loadPermissionKeys = cache(readPermissionKeys);
