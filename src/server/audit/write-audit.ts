import "server-only";
import type { AuditAction } from "@/server/audit/audit-actions";
import { db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

/** A transaction handle from db.transaction(). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuditEntry = {
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

/**
 * Writes one audit row. Always call it with the transaction that makes the change, so the change
 * and its audit row succeed or fail together (docs/permissions.md §6 rule 7).
 */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    details: entry.details ?? null,
  });
}
