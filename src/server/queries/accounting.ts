import "server-only";
import { aliasedTable, and, asc, desc, eq, gte, inArray, lte, sql, type Column, type SQL } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { JournalSource } from "@/db/schema";
import type { ComboOption } from "@/components/app/combobox";
import { endOfMonth, round2, startOfMonth, today } from "@/lib/format";
import { accountBalance, accountTotals } from "@/server/services/accounting";
import { isDebitNormal } from "@/server/services/chart-of-accounts";
import { partyNames } from "@/server/services/finance-reports";
import { customerOptions, employeeOptions, supplierOptions } from "./options";

const range = (col: Column, f: { from?: string; to?: string }) => {
  const w: SQL[] = [];
  if (f.from) w.push(gte(col, f.from));
  if (f.to) w.push(lte(col, f.to));
  return w;
};

// ---- Pickers ----------------------------------------------------------------------------------

/** Every postable account (inactive too, flagged) for the ledger picker. */
export async function ledgerAccountOptions(): Promise<ComboOption[]> {
  const rows = await db.select().from(s.accounts).where(eq(s.accounts.isGroup, false)).orderBy(asc(s.accounts.code));
  return rows.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}${a.isActive ? "" : " (inactive)"}`, hint: a.type, keywords: a.name }));
}

export async function partyPickerOptions() {
  const [customer, supplier, employee] = await Promise.all([customerOptions(), supplierOptions(), employeeOptions()]);
  const strip = (o: ComboOption[]) => o.map(({ value, label, hint, keywords }) => ({ value, label, hint, keywords }));
  return { customer: strip(customer), supplier: strip(supplier), employee: strip(employee) };
}
export type PartyPickerOptions = Awaited<ReturnType<typeof partyPickerOptions>>;

/** Group accounts for the "parent" picker in the account dialog. */
export async function groupAccounts() {
  return db
    .select({ id: s.accounts.id, code: s.accounts.code, name: s.accounts.name, type: s.accounts.type })
    .from(s.accounts)
    .where(eq(s.accounts.isGroup, true))
    .orderBy(asc(s.accounts.code));
}

// ---- Journals ---------------------------------------------------------------------------------

export async function listJournals(f: { from: string; to: string; source?: string; status?: string }) {
  const where = range(s.journalEntries.date, f);
  if (f.source) where.push(eq(s.journalEntries.sourceType, f.source as JournalSource));
  if (f.status === "posted" || f.status === "void") where.push(eq(s.journalEntries.status, f.status));
  return db
    .select({
      id: s.journalEntries.id,
      number: s.journalEntries.number,
      date: s.journalEntries.date,
      memo: s.journalEntries.memo,
      sourceType: s.journalEntries.sourceType,
      sourceId: s.journalEntries.sourceId,
      sourceNumber: s.journalEntries.sourceNumber,
      total: s.journalEntries.total,
      status: s.journalEntries.status,
    })
    .from(s.journalEntries)
    .where(and(...where))
    .orderBy(desc(s.journalEntries.date), desc(s.journalEntries.number))
    .limit(2000);
}
export type JournalListRow = Awaited<ReturnType<typeof listJournals>>[number];

export async function getJournal(id: string) {
  const [entry] = await db
    .select({ entry: s.journalEntries, createdByName: s.users.name })
    .from(s.journalEntries)
    .leftJoin(s.users, eq(s.users.id, s.journalEntries.createdBy))
    .where(eq(s.journalEntries.id, id));
  if (!entry) return null;
  const lines = await db
    .select({
      id: s.journalLines.id,
      lineNo: s.journalLines.lineNo,
      accountId: s.journalLines.accountId,
      code: s.accounts.code,
      name: s.accounts.name,
      debit: s.journalLines.debit,
      credit: s.journalLines.credit,
      partyType: s.journalLines.partyType,
      partyId: s.journalLines.partyId,
      memo: s.journalLines.memo,
    })
    .from(s.journalLines)
    .innerJoin(s.accounts, eq(s.accounts.id, s.journalLines.accountId))
    .where(eq(s.journalLines.entryId, id))
    .orderBy(asc(s.journalLines.lineNo));
  const names = await partyNames(db, lines);
  return {
    ...entry.entry,
    createdByName: entry.createdByName,
    lines: lines.map((l) => ({ ...l, partyName: l.partyType && l.partyId ? (names.get(`${l.partyType}:${l.partyId}`) ?? "Unknown party") : null })),
  };
}

// ---- Cash & bank ------------------------------------------------------------------------------

export async function listRegisters() {
  const rows = await db
    .select({ reg: s.bankAccounts, code: s.accounts.code, accountName: s.accounts.name, accountActive: s.accounts.isActive })
    .from(s.bankAccounts)
    .innerJoin(s.accounts, eq(s.accounts.id, s.bankAccounts.accountId))
    .orderBy(asc(s.accounts.code));
  const all = await accountTotals(db, { to: today() });
  const month = await accountTotals(db, { from: startOfMonth(), to: endOfMonth() });
  return rows.map((r) => {
    const t = all.get(r.reg.accountId) ?? { debit: 0, credit: 0 };
    const m = month.get(r.reg.accountId) ?? { debit: 0, credit: 0 };
    return {
      ...r.reg,
      code: r.code,
      isActive: r.reg.isActive && r.accountActive,
      balance: round2(t.debit - t.credit),
      monthIn: m.debit,
      monthOut: m.credit,
    };
  });
}
export type RegisterRow = Awaited<ReturnType<typeof listRegisters>>[number];

export async function getRegister(id: string) {
  const [row] = await db
    .select({ reg: s.bankAccounts, code: s.accounts.code })
    .from(s.bankAccounts)
    .innerJoin(s.accounts, eq(s.accounts.id, s.bankAccounts.accountId))
    .where(eq(s.bankAccounts.id, id));
  if (!row) return null;
  return { ...row.reg, code: row.code, balance: await accountBalance(db, row.reg.accountId) };
}

const fromAcc = aliasedTable(s.accounts, "from_acc");
const toAcc = aliasedTable(s.accounts, "to_acc");

export async function listTransfers(f: { from?: string; to?: string; accountId?: string } = {}) {
  const where = range(s.bankTransfers.date, f);
  if (f.accountId) where.push(sql`(${s.bankTransfers.fromAccountId} = ${f.accountId} or ${s.bankTransfers.toAccountId} = ${f.accountId})`);
  return db
    .select({
      id: s.bankTransfers.id,
      number: s.bankTransfers.number,
      date: s.bankTransfers.date,
      fromName: fromAcc.name,
      toName: toAcc.name,
      amount: s.bankTransfers.amount,
      reference: s.bankTransfers.reference,
      status: s.bankTransfers.status,
    })
    .from(s.bankTransfers)
    .innerJoin(fromAcc, eq(fromAcc.id, s.bankTransfers.fromAccountId))
    .innerJoin(toAcc, eq(toAcc.id, s.bankTransfers.toAccountId))
    .where(and(...where))
    .orderBy(desc(s.bankTransfers.date), desc(s.bankTransfers.number))
    .limit(1000);
}
export type TransferRow = Awaited<ReturnType<typeof listTransfers>>[number];

export async function getTransfer(id: string) {
  const [row] = await db
    .select({ t: s.bankTransfers, fromName: fromAcc.name, fromCode: fromAcc.code, toName: toAcc.name, toCode: toAcc.code, createdByName: s.users.name })
    .from(s.bankTransfers)
    .innerJoin(fromAcc, eq(fromAcc.id, s.bankTransfers.fromAccountId))
    .innerJoin(toAcc, eq(toAcc.id, s.bankTransfers.toAccountId))
    .leftJoin(s.users, eq(s.users.id, s.bankTransfers.createdBy))
    .where(eq(s.bankTransfers.id, id));
  return row ? { ...row.t, fromName: row.fromName, fromCode: row.fromCode, toName: row.toName, toCode: row.toCode, createdByName: row.createdByName } : null;
}

/** Cash / bank / petty cash accounts with their current balance, for "from" pickers. */
export async function moneyAccountOptions(opts: { includePettyCash?: boolean } = {}): Promise<(ComboOption & { balance: number; subtype: string | null })[]> {
  const subtypes = opts.includePettyCash ? ["cash", "bank", "petty_cash"] : ["cash", "bank"];
  const rows = await db
    .select()
    .from(s.accounts)
    .where(and(inArray(s.accounts.subtype, subtypes as ("cash" | "bank" | "petty_cash")[]), eq(s.accounts.isGroup, false), eq(s.accounts.isActive, true)))
    .orderBy(asc(s.accounts.code));
  const totals = await accountTotals(db);
  return rows.map((a) => {
    const t = totals.get(a.id) ?? { debit: 0, credit: 0 };
    const balance = round2(isDebitNormal(a.type) ? t.debit - t.credit : t.credit - t.debit);
    return { value: a.id, label: a.name, hint: a.code, balance, subtype: a.subtype };
  });
}

// ---- Petty cash -------------------------------------------------------------------------------

export async function listFunds() {
  const rows = await db
    .select({ fund: s.pettyCashFunds, code: s.accounts.code })
    .from(s.pettyCashFunds)
    .innerJoin(s.accounts, eq(s.accounts.id, s.pettyCashFunds.accountId))
    .orderBy(asc(s.pettyCashFunds.name));
  const totals = await accountTotals(db);
  const spent = await db
    .select({ fundId: s.pettyCashVouchers.fundId, total: sql<number>`coalesce(sum(${s.pettyCashVouchers.amount}), 0)`.mapWith(Number) })
    .from(s.pettyCashVouchers)
    .where(and(eq(s.pettyCashVouchers.status, "posted"), eq(s.pettyCashVouchers.type, "expense"), gte(s.pettyCashVouchers.date, startOfMonth()), lte(s.pettyCashVouchers.date, endOfMonth())))
    .groupBy(s.pettyCashVouchers.fundId);
  const spentMap = new Map(spent.map((r) => [r.fundId, round2(r.total)]));
  return rows.map((r) => {
    const t = totals.get(r.fund.accountId) ?? { debit: 0, credit: 0 };
    const balance = round2(t.debit - t.credit);
    const float = r.fund.floatAmount;
    return {
      ...r.fund,
      code: r.code,
      balance,
      replenish: Math.max(0, round2(float - balance)),
      usedPct: float > 0 ? Math.min(100, Math.max(0, ((float - balance) / float) * 100)) : 0,
      spentThisMonth: spentMap.get(r.fund.id) ?? 0,
    };
  });
}
export type FundRow = Awaited<ReturnType<typeof listFunds>>[number];

export async function listVouchers(f: { from: string; to: string; fundId?: string; type?: string; status?: string }) {
  const where = range(s.pettyCashVouchers.date, f);
  if (f.fundId) where.push(eq(s.pettyCashVouchers.fundId, f.fundId));
  if (f.type === "expense" || f.type === "topup") where.push(eq(s.pettyCashVouchers.type, f.type));
  if (f.status === "posted" || f.status === "void") where.push(eq(s.pettyCashVouchers.status, f.status));
  return db
    .select({
      id: s.pettyCashVouchers.id,
      number: s.pettyCashVouchers.number,
      date: s.pettyCashVouchers.date,
      fundName: s.pettyCashFunds.name,
      type: s.pettyCashVouchers.type,
      accountName: s.accounts.name,
      amount: s.pettyCashVouchers.amount,
      payee: s.pettyCashVouchers.payee,
      description: s.pettyCashVouchers.description,
      receiptRef: s.pettyCashVouchers.receiptRef,
      status: s.pettyCashVouchers.status,
    })
    .from(s.pettyCashVouchers)
    .innerJoin(s.pettyCashFunds, eq(s.pettyCashFunds.id, s.pettyCashVouchers.fundId))
    .innerJoin(s.accounts, eq(s.accounts.id, s.pettyCashVouchers.accountId))
    .where(and(...where))
    .orderBy(desc(s.pettyCashVouchers.date), desc(s.pettyCashVouchers.number))
    .limit(2000);
}
export type VoucherRow = Awaited<ReturnType<typeof listVouchers>>[number];

export async function getVoucher(id: string) {
  const [row] = await db
    .select({ v: s.pettyCashVouchers, fundName: s.pettyCashFunds.name, custodian: s.pettyCashFunds.custodianName, accountCode: s.accounts.code, accountName: s.accounts.name, createdByName: s.users.name })
    .from(s.pettyCashVouchers)
    .innerJoin(s.pettyCashFunds, eq(s.pettyCashFunds.id, s.pettyCashVouchers.fundId))
    .innerJoin(s.accounts, eq(s.accounts.id, s.pettyCashVouchers.accountId))
    .leftJoin(s.users, eq(s.users.id, s.pettyCashVouchers.createdBy))
    .where(eq(s.pettyCashVouchers.id, id));
  return row ? { ...row.v, fundName: row.fundName, custodian: row.custodian, accountCode: row.accountCode, accountName: row.accountName, createdByName: row.createdByName } : null;
}

// ---- Expenses ---------------------------------------------------------------------------------

const expAcc = aliasedTable(s.accounts, "exp_acc");
const paidAcc = aliasedTable(s.accounts, "paid_acc");

export async function listExpenses(f: { from: string; to: string; status?: string; accountId?: string }) {
  const where = range(s.expenses.date, f);
  if (f.status === "posted" || f.status === "void") where.push(eq(s.expenses.status, f.status));
  if (f.accountId) where.push(eq(s.expenses.expenseAccountId, f.accountId));
  return db
    .select({
      id: s.expenses.id,
      number: s.expenses.number,
      date: s.expenses.date,
      category: expAcc.name,
      paidFrom: paidAcc.name,
      payee: sql<string | null>`coalesce(${s.expenses.payee}, ${s.suppliers.name})`,
      description: s.expenses.description,
      reference: s.expenses.reference,
      amount: s.expenses.amount,
      taxAmount: s.expenses.taxAmount,
      status: s.expenses.status,
    })
    .from(s.expenses)
    .innerJoin(expAcc, eq(expAcc.id, s.expenses.expenseAccountId))
    .innerJoin(paidAcc, eq(paidAcc.id, s.expenses.paidFromAccountId))
    .leftJoin(s.suppliers, eq(s.suppliers.id, s.expenses.supplierId))
    .where(and(...where))
    .orderBy(desc(s.expenses.date), desc(s.expenses.number))
    .limit(2000);
}
export type ExpenseRow = Awaited<ReturnType<typeof listExpenses>>[number];

export async function getExpense(id: string) {
  const [row] = await db
    .select({
      e: s.expenses,
      expCode: expAcc.code,
      expName: expAcc.name,
      paidCode: paidAcc.code,
      paidName: paidAcc.name,
      supplierName: s.suppliers.name,
      createdByName: s.users.name,
    })
    .from(s.expenses)
    .innerJoin(expAcc, eq(expAcc.id, s.expenses.expenseAccountId))
    .innerJoin(paidAcc, eq(paidAcc.id, s.expenses.paidFromAccountId))
    .leftJoin(s.suppliers, eq(s.suppliers.id, s.expenses.supplierId))
    .leftJoin(s.users, eq(s.users.id, s.expenses.createdBy))
    .where(eq(s.expenses.id, id));
  if (!row) return null;
  const { e, ...rest } = row;
  return { ...e, ...rest };
}

/** Posted expense totals (before tax) by category for a range. */
export async function expensesByCategory(f: { from: string; to: string }) {
  const rows = await db
    .select({
      accountId: s.expenses.expenseAccountId,
      name: s.accounts.name,
      total: sql<number>`coalesce(sum(${s.expenses.amount}), 0)`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(s.expenses)
    .innerJoin(s.accounts, eq(s.accounts.id, s.expenses.expenseAccountId))
    .where(and(eq(s.expenses.status, "posted"), gte(s.expenses.date, f.from), lte(s.expenses.date, f.to)))
    .groupBy(s.expenses.expenseAccountId, s.accounts.name);
  return rows.map((r) => ({ ...r, total: round2(r.total) })).sort((a, b) => b.total - a.total);
}
