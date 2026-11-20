import type { DbOrTx } from "@/db/client";
import { auditLogs } from "@/db/schema";

export interface Actor {
  id: string;
  name: string;
}

export async function logAudit(
  db: DbOrTx,
  actor: Actor | null,
  entry: { action: string; entity: string; entityId?: string | null; summary: string; data?: unknown }
) {
  await db.insert(auditLogs).values({
    userId: actor?.id ?? null,
    userName: actor?.name ?? "System",
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    data: entry.data ?? null,
  });
}
