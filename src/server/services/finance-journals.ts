// Manual (and opening balance) journal entries.
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { journalEntries } from "@/db/schema";
import { round2 } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { SOURCE_LABELS, USER_VOIDABLE_SOURCES, type ManualJournalInput } from "./finance-shared";

export async function createManualJournal(db: DbOrTx, actor: Actor | null, input: ManualJournalInput) {
  const lines = input.lines
    .map((l) => ({ ...l, debit: round2(l.debit ?? 0), credit: round2(l.credit ?? 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);

  lines.forEach((l, i) => {
    if (l.debit > 0 && l.credit > 0) throw new AppError(`Line ${i + 1}: enter either a debit or a credit, not both`);
    if ((l.partyType && !l.partyId) || (!l.partyType && l.partyId)) throw new AppError(`Line ${i + 1}: choose both the party type and the party`);
  });
  const dr = round2(lines.reduce((s, l) => s + l.debit, 0));
  const cr = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (dr !== cr) throw new AppError(`Debits (${dr}) and credits (${cr}) must be equal. Difference: ${round2(dr - cr)}`);
  if (dr === 0) throw new AppError("Enter the amounts for this entry");

  const entry = await postJournal(db, actor, {
    date: input.date,
    memo: input.memo,
    sourceType: input.isOpening ? "opening" : "manual",
    lines: lines.map((l) => ({
      account: l.accountId,
      debit: l.debit,
      credit: l.credit,
      partyType: l.partyType ?? null,
      partyId: l.partyType ? (l.partyId ?? null) : null,
      memo: l.memo ?? null,
    })),
  });
  await logAudit(db, actor, {
    action: "post",
    entity: "journal_entry",
    entityId: entry.id,
    summary: `Posted ${input.isOpening ? "opening balance" : "manual"} journal ${entry.number} for ${dr}`,
  });
  return { id: entry.id, number: entry.number };
}

/** Only manual and opening journals are voided here; document journals are voided from their documents. */
export async function voidManualJournal(db: DbOrTx, actor: Actor | null, input: { id: string; reason?: string | null }) {
  const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, input.id));
  if (!entry) throw new AppError("Journal entry not found");
  if (entry.status === "void") throw new AppError("This journal is already void");
  if (!USER_VOIDABLE_SOURCES.includes(entry.sourceType)) {
    throw new AppError(
      `${entry.number} was posted by ${SOURCE_LABELS[entry.sourceType].toLowerCase()} ${entry.sourceNumber ?? ""}. Void that document instead, so the document and its books stay in step.`.replace(/\s+\./, ".")
    );
  }
  await voidJournal(db, actor, entry.id, input.reason ?? undefined);
  return { id: entry.id };
}
