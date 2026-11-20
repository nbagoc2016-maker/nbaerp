import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { accounts, company, journalEntries, journalLines, type JournalSource } from "@/db/schema";
import { round2 } from "@/lib/format";
import { AppError } from "../errors";
import { logAudit, type Actor } from "./audit";
import { isDebitNormal } from "./chart-of-accounts";
import { nextNumber } from "./numbering";

export interface JournalLineInput {
  /** Account id, or a code like "1300" (looked up for you) */
  account: string;
  debit?: number;
  credit?: number;
  partyType?: "customer" | "supplier" | "employee" | null;
  partyId?: string | null;
  memo?: string | null;
}

export interface PostJournalInput {
  date: string; // YYYY-MM-DD
  memo?: string;
  sourceType?: JournalSource;
  sourceId?: string | null;
  sourceNumber?: string | null;
  lines: JournalLineInput[];
}

const CODE_RE = /^\d{3,6}$/;

async function resolveAccounts(db: DbOrTx, refs: string[]) {
  const codes = refs.filter((r) => CODE_RE.test(r));
  const ids = refs.filter((r) => !CODE_RE.test(r));
  const rows = await db
    .select()
    .from(accounts)
    .where(
      codes.length && ids.length
        ? sql`${inArray(accounts.code, codes)} or ${inArray(accounts.id, ids)}`
        : codes.length
          ? inArray(accounts.code, codes)
          : inArray(accounts.id, ids)
    );
  const map = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    map.set(r.id, r);
    map.set(r.code, r);
  }
  return map;
}

export async function getAccountByCode(db: DbOrTx, code: string) {
  const [row] = await db.select().from(accounts).where(eq(accounts.code, code));
  if (!row) throw new AppError(`Account ${code} is missing from the chart of accounts`);
  return row;
}

export async function assertNotLocked(db: DbOrTx, date: string) {
  const [c] = await db.select({ lockDate: company.lockDate }).from(company).limit(1);
  if (c?.lockDate && date <= c.lockDate) {
    throw new AppError(`The books are closed up to ${c.lockDate}. Choose a later date or ask an admin to reopen the period.`);
  }
}

/**
 * Post a balanced double-entry journal. Lines with both sides zero are dropped; debits must equal
 * credits to the paisa. Returns the created entry.
 */
export async function postJournal(db: DbOrTx, actor: Actor | null, input: PostJournalInput) {
  const lines = input.lines
    .map((l) => ({ ...l, debit: round2(l.debit ?? 0), credit: round2(l.credit ?? 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);

  if (lines.length < 2) throw new AppError("A journal entry needs at least two lines");
  for (const l of lines) {
    if (l.debit < 0 || l.credit < 0) throw new AppError("Debit and credit amounts can't be negative");
    if (l.debit > 0 && l.credit > 0) throw new AppError("A line can have a debit or a credit, not both");
  }
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new AppError(`Journal is out of balance: debits ${totalDebit} vs credits ${totalCredit}`);
  }

  await assertNotLocked(db, input.date);

  const accountMap = await resolveAccounts(db, [...new Set(lines.map((l) => l.account))]);
  for (const l of lines) {
    const acc = accountMap.get(l.account);
    if (!acc) throw new AppError(`Unknown account ${l.account}`);
    if (acc.isGroup) throw new AppError(`"${acc.name}" is a header account and can't receive postings`);
    if (!acc.isActive) throw new AppError(`Account "${acc.name}" is inactive`);
  }

  const number = await nextNumber(db, "JE");
  const [entry] = await db
    .insert(journalEntries)
    .values({
      number,
      date: input.date,
      memo: input.memo ?? null,
      sourceType: input.sourceType ?? "manual",
      sourceId: input.sourceId ?? null,
      sourceNumber: input.sourceNumber ?? null,
      total: totalDebit,
      createdBy: actor?.id ?? null,
    })
    .returning();

  await db.insert(journalLines).values(
    lines.map((l, i) => ({
      entryId: entry.id,
      lineNo: i + 1,
      accountId: accountMap.get(l.account)!.id,
      debit: l.debit,
      credit: l.credit,
      partyType: l.partyType ?? null,
      partyId: l.partyId ?? null,
      memo: l.memo ?? null,
      date: input.date,
    }))
  );

  return entry;
}

/** Void a journal: it stays visible for audit but drops out of every balance and report. */
export async function voidJournal(db: DbOrTx, actor: Actor | null, entryId: string | null | undefined, reason?: string) {
  if (!entryId) return;
  const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, entryId));
  if (!entry || entry.status === "void") return;
  await assertNotLocked(db, entry.date);
  await db.update(journalEntries).set({ status: "void" }).where(eq(journalEntries.id, entryId));
  await logAudit(db, actor, {
    action: "void",
    entity: "journal_entry",
    entityId: entryId,
    summary: `Voided journal ${entry.number}${reason ? `: ${reason}` : ""}`,
  });
}

// ---- Balances -------------------------------------------------------------------------------

const postedOnly = sql`${journalLines.entryId} in (select id from journal_entries where status = 'posted')`;

export interface BalanceFilter {
  from?: string;
  to?: string;
  partyType?: "customer" | "supplier" | "employee";
  partyId?: string;
}

function lineFilters(f: BalanceFilter): SQL[] {
  const where: SQL[] = [postedOnly];
  if (f.from) where.push(gte(journalLines.date, f.from));
  if (f.to) where.push(lte(journalLines.date, f.to));
  if (f.partyType) where.push(eq(journalLines.partyType, f.partyType));
  if (f.partyId) where.push(eq(journalLines.partyId, f.partyId));
  return where;
}

/** Debit/credit totals per account (posted entries only). */
export async function accountTotals(db: DbOrTx, f: BalanceFilter = {}) {
  const rows = await db
    .select({
      accountId: journalLines.accountId,
      debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`.mapWith(Number),
      credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`.mapWith(Number),
    })
    .from(journalLines)
    .where(and(...lineFilters(f)))
    .groupBy(journalLines.accountId);
  return new Map(rows.map((r) => [r.accountId, { debit: round2(r.debit), credit: round2(r.credit) }]));
}

/** Signed balance in the account's normal direction (assets/expenses: debit - credit). */
export async function accountBalance(db: DbOrTx, accountIdOrCode: string, f: BalanceFilter = {}) {
  const acc = CODE_RE.test(accountIdOrCode)
    ? await getAccountByCode(db, accountIdOrCode)
    : (await db.select().from(accounts).where(eq(accounts.id, accountIdOrCode)))[0];
  if (!acc) throw new AppError("Account not found");
  const [row] = await db
    .select({
      debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`.mapWith(Number),
      credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`.mapWith(Number),
    })
    .from(journalLines)
    .where(and(eq(journalLines.accountId, acc.id), ...lineFilters(f)));
  return round2(isDebitNormal(acc.type) ? row.debit - row.credit : row.credit - row.debit);
}

/**
 * What a customer owes us (positive) or what we owe a supplier (positive), straight from the GL
 * receivable / payable lines tagged with that party.
 */
export async function partyBalance(db: DbOrTx, partyType: "customer" | "supplier" | "employee", partyId: string, to?: string) {
  const [row] = await db
    .select({
      debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`.mapWith(Number),
      credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`.mapWith(Number),
    })
    .from(journalLines)
    .where(and(...lineFilters({ partyType, partyId, to })));
  return round2(partyType === "supplier" ? row.credit - row.debit : row.debit - row.credit);
}
