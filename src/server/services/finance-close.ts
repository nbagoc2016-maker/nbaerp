// Closing the books: the company lock date. postJournal / voidJournal refuse dates on or before it.
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { company } from "@/db/schema";
import { formatDate, today } from "@/lib/format";
import { AppError } from "../errors";
import { logAudit, type Actor } from "./audit";

export async function getLockDate(db: DbOrTx) {
  const [c] = await db.select({ lockDate: company.lockDate }).from(company).limit(1);
  return c?.lockDate ?? null;
}

export async function setLockDate(db: DbOrTx, actor: Actor | null, input: { lockDate: string | null }) {
  if (input.lockDate && input.lockDate >= today()) {
    throw new AppError("You can only close periods that have ended. Choose a date before today.", { lockDate: "Must be before today" });
  }
  const previous = await getLockDate(db);
  const [row] = await db.select({ id: company.id }).from(company).limit(1);
  if (!row) throw new AppError("Set up the company profile first");
  await db.update(company).set({ lockDate: input.lockDate }).where(eq(company.id, row.id));
  await logAudit(db, actor, {
    action: input.lockDate ? "close" : "reopen",
    entity: "company",
    entityId: row.id,
    summary: input.lockDate
      ? `Books closed up to ${formatDate(input.lockDate)}${previous ? ` (was ${formatDate(previous)})` : ""}`
      : `Books reopened (were closed up to ${previous ? formatDate(previous) : "—"})`,
    data: { previous, lockDate: input.lockDate },
  });
  return { lockDate: input.lockDate };
}
