// Ledgers and financial statements, computed straight from posted journal lines.
// Every function takes (db, input) so pages and tests share exactly the same maths.
import { and, asc, eq, gte, inArray, lte, ne, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { accounts, customers, employees, journalEntries, journalLines, suppliers, type AccountType, type JournalSource } from "@/db/schema";
import { addDays, round2, today } from "@/lib/format";
import { accountBalance, accountTotals } from "./accounting";
import { isDebitNormal } from "./chart-of-accounts";
import { getAccount, type AccountRow } from "./finance-accounts";
import { isCashSubtype, type PartyType } from "./finance-shared";

type Totals = Map<string, { debit: number; credit: number }>;

const normal = (acc: Pick<AccountRow, "type">, t: { debit: number; credit: number } | undefined) =>
  t ? round2(isDebitNormal(acc.type) ? t.debit - t.credit : t.credit - t.debit) : 0;

const loadAccounts = (db: DbOrTx) => db.select().from(accounts).orderBy(asc(accounts.code));

function childrenMap(all: AccountRow[]) {
  const map = new Map<string | null, AccountRow[]>();
  for (const a of all) {
    const key = a.parentId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return map;
}

/** Rolled-up normal-side balance per account id (groups = sum of everything under them). */
function rollUp(all: AccountRow[], totals: Totals) {
  const kids = childrenMap(all);
  const out = new Map<string, number>();
  const visit = (a: AccountRow): number => {
    let v = a.isGroup ? 0 : normal(a, totals.get(a.id));
    for (const c of kids.get(a.id) ?? []) v += visit(c);
    v = round2(v);
    out.set(a.id, v);
    return v;
  };
  for (const r of kids.get(null) ?? []) visit(r);
  // Orphans (parent missing) still get a value
  for (const a of all) if (!out.has(a.id)) visit(a);
  return out;
}

// ---- Chart of accounts ------------------------------------------------------------------------

export interface ChartNode extends AccountRow {
  depth: number;
  balance: number;
  hasPostings: boolean;
  hasChildren: boolean;
  path: string; // codes from the root, for search context
}

export async function chartOfAccounts(db: DbOrTx, asOf = today()): Promise<ChartNode[]> {
  const all = await loadAccounts(db);
  const totals = await accountTotals(db, { to: asOf });
  const counts = await db
    .select({ accountId: journalLines.accountId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(journalLines)
    .groupBy(journalLines.accountId);
  const posted = new Set(counts.filter((c) => c.n > 0).map((c) => c.accountId));
  const balances = rollUp(all, totals);
  const kids = childrenMap(all);
  const out: ChartNode[] = [];
  const seen = new Set<string>();
  const visit = (a: AccountRow, depth: number, path: string) => {
    seen.add(a.id);
    const children = kids.get(a.id) ?? [];
    out.push({ ...a, depth, balance: balances.get(a.id) ?? 0, hasPostings: posted.has(a.id), hasChildren: children.length > 0, path });
    for (const c of children) visit(c, depth + 1, `${path} ${a.code} ${a.name}`);
  };
  for (const r of kids.get(null) ?? []) visit(r, 0, "");
  for (const a of all) if (!seen.has(a.id)) visit(a, 0, "");
  return out;
}

// ---- Trial balance ----------------------------------------------------------------------------

export interface TrialBalanceRow {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

export async function trialBalance(db: DbOrTx, asOf: string) {
  const all = await loadAccounts(db);
  const totals = await accountTotals(db, { to: asOf });
  const rows: TrialBalanceRow[] = [];
  for (const a of all) {
    const t = totals.get(a.id);
    if (!t) continue;
    const net = round2(t.debit - t.credit);
    if (net === 0) continue;
    rows.push({ id: a.id, code: a.code, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  }
  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
  const difference = round2(totalDebit - totalCredit);
  return { asOf, rows, totalDebit, totalCredit, difference, balanced: Math.abs(difference) < 0.005 };
}

// ---- Profit & loss ----------------------------------------------------------------------------

export interface PnlLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}
export interface PnlSection {
  lines: PnlLine[];
  total: number;
}

const COST_OF_SALES_SUBTYPES = new Set(["cogs", "inventory_adjustment"]);
const COST_OF_SALES_GROUP = "5000";

function isUnder(all: Map<string, AccountRow>, acc: AccountRow, code: string) {
  let cur: AccountRow | undefined = acc;
  while (cur) {
    if (cur.code === code) return true;
    cur = cur.parentId ? all.get(cur.parentId) : undefined;
  }
  return false;
}

export async function profitAndLoss(db: DbOrTx, period: { from: string; to: string }) {
  const all = await loadAccounts(db);
  const byId = new Map(all.map((a) => [a.id, a]));
  const totals = await accountTotals(db, period);
  const sales: PnlLine[] = [];
  const returns: PnlLine[] = [];
  const otherIncome: PnlLine[] = [];
  const cost: PnlLine[] = [];
  const opex: PnlLine[] = [];

  for (const a of all) {
    if (a.isGroup || (a.type !== "income" && a.type !== "expense")) continue;
    const t = totals.get(a.id);
    if (!t) continue;
    const base = { accountId: a.id, code: a.code, name: a.name };
    if (a.type === "income") {
      if (a.subtype === "sales_returns") {
        const amount = round2(t.debit - t.credit); // a deduction from revenue
        if (amount !== 0) returns.push({ ...base, amount });
      } else {
        const amount = round2(t.credit - t.debit);
        if (amount === 0) continue;
        (a.subtype === "sales" ? sales : otherIncome).push({ ...base, amount });
      }
    } else {
      const amount = round2(t.debit - t.credit);
      if (amount === 0) continue;
      (COST_OF_SALES_SUBTYPES.has(a.subtype ?? "") || isUnder(byId, a, COST_OF_SALES_GROUP) ? cost : opex).push({ ...base, amount });
    }
  }

  const section = (lines: PnlLine[]): PnlSection => ({ lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)) });
  const s = section(sales);
  const r = section(returns);
  const netRevenue = round2(s.total - r.total);
  const costOfSales = section(cost);
  const grossProfit = round2(netRevenue - costOfSales.total);
  const operatingExpenses = section(opex);
  const operatingProfit = round2(grossProfit - operatingExpenses.total);
  const other = section(otherIncome);
  const netProfit = round2(operatingProfit + other.total);
  return {
    ...period,
    sales: s,
    returns: r,
    netRevenue,
    costOfSales,
    grossProfit,
    grossMargin: netRevenue !== 0 ? (grossProfit / netRevenue) * 100 : null,
    operatingExpenses,
    operatingProfit,
    otherIncome: other,
    netProfit,
    netMargin: netRevenue !== 0 ? (netProfit / netRevenue) * 100 : null,
  };
}
export type ProfitAndLoss = Awaited<ReturnType<typeof profitAndLoss>>;

/** Income minus expenses (all income/expense accounts) for a range — the earnings not yet closed to equity. */
async function earnings(db: DbOrTx, all: AccountRow[], f: { from?: string; to?: string }) {
  const totals = await accountTotals(db, f);
  let v = 0;
  for (const a of all) {
    const t = totals.get(a.id);
    if (!t) continue;
    if (a.type === "income") v += t.credit - t.debit;
    else if (a.type === "expense") v -= t.debit - t.credit;
  }
  return round2(v);
}

// ---- Balance sheet ----------------------------------------------------------------------------

export interface BsRow {
  kind: "group" | "account" | "total";
  id: string;
  code: string;
  name: string;
  depth: number;
  amount: number;
}
export interface BsSection {
  type: AccountType;
  title: string;
  rows: BsRow[];
  total: number;
}

export async function balanceSheet(db: DbOrTx, asOf: string) {
  const all = await loadAccounts(db);
  const totals = await accountTotals(db, { to: asOf });
  const rolled = rollUp(all, totals);
  const kids = childrenMap(all);

  // Leaf accounts with a balance, grouped under their headers; root headers become the section itself
  const build = (type: AccountType, title: string): BsSection => {
    const rows: BsRow[] = [];
    const hasBalance = (a: AccountRow): boolean =>
      a.isGroup ? (kids.get(a.id) ?? []).some(hasBalance) : normal(a, totals.get(a.id)) !== 0;
    const visit = (a: AccountRow, depth: number, isRoot: boolean) => {
      if (a.type !== type || !hasBalance(a)) return;
      if (!a.isGroup) {
        rows.push({ kind: "account", id: a.id, code: a.code, name: a.name, depth, amount: normal(a, totals.get(a.id)) });
        return;
      }
      const children = kids.get(a.id) ?? [];
      if (isRoot) {
        for (const c of children) visit(c, depth, false);
        return;
      }
      rows.push({ kind: "group", id: a.id, code: a.code, name: a.name, depth, amount: rolled.get(a.id) ?? 0 });
      for (const c of children) visit(c, depth + 1, false);
      rows.push({ kind: "total", id: `${a.id}-total`, code: a.code, name: `Total ${a.name}`, depth, amount: rolled.get(a.id) ?? 0 });
    };
    for (const root of (kids.get(null) ?? []).filter((a) => a.type === type)) visit(root, 0, true);
    // Accounts whose parent is of another type (shouldn't happen) are still counted
    for (const a of all) {
      if (a.type !== type || !a.parentId) continue;
      const parent = all.find((p) => p.id === a.parentId);
      if (parent && parent.type !== type) visit(a, 0, false);
    }
    const total = round2(
      all.filter((a) => a.type === type && !a.isGroup).reduce((s, a) => s + normal(a, totals.get(a.id)), 0)
    );
    return { type, title, rows, total };
  };

  const assets = build("asset", "Assets");
  const liabilities = build("liability", "Liabilities");
  const equity = build("equity", "Equity");
  const currentEarnings = await earnings(db, all, { to: asOf });
  if (currentEarnings !== 0 || equity.rows.length === 0) {
    equity.rows.push({ kind: "account", id: "current-earnings", code: "", name: "Current period earnings (not yet closed)", depth: 0, amount: currentEarnings });
  }
  equity.total = round2(equity.total + currentEarnings);
  const totalLiabilitiesAndEquity = round2(liabilities.total + equity.total);
  const difference = round2(assets.total - totalLiabilitiesAndEquity);
  return {
    asOf,
    assets,
    liabilities,
    equity,
    currentEarnings,
    totalAssets: assets.total,
    totalLiabilities: liabilities.total,
    totalEquity: equity.total,
    totalLiabilitiesAndEquity,
    difference,
    balanced: Math.abs(difference) < 0.005,
  };
}
export type BalanceSheet = Awaited<ReturnType<typeof balanceSheet>>;

// ---- Cash flow (direct, by source document type) ----------------------------------------------

export interface CashFlowRow {
  sourceType: JournalSource;
  inflow: number;
  outflow: number;
  net: number;
  count: number;
}

export async function cashFlow(db: DbOrTx, period: { from: string; to: string }) {
  const all = await loadAccounts(db);
  const cashAccounts = all.filter((a) => !a.isGroup && isCashSubtype(a.subtype));
  const ids = cashAccounts.map((a) => a.id);
  const before = addDays(period.from, -1);
  const openingTotals = await accountTotals(db, { to: before });
  const periodTotals = await accountTotals(db, period);

  const perAccount = cashAccounts
    .map((a) => {
      const opening = normal(a, openingTotals.get(a.id));
      const t = periodTotals.get(a.id) ?? { debit: 0, credit: 0 };
      return { id: a.id, code: a.code, name: a.name, subtype: a.subtype, opening, inflow: t.debit, outflow: t.credit, closing: round2(opening + t.debit - t.credit) };
    })
    .filter((a) => a.opening !== 0 || a.inflow !== 0 || a.outflow !== 0);

  const byEntry = ids.length
    ? await db
        .select({
          entryId: journalEntries.id,
          sourceType: journalEntries.sourceType,
          net: sql<number>`coalesce(sum(${journalLines.debit} - ${journalLines.credit}), 0)`.mapWith(Number),
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(
          and(
            eq(journalEntries.status, "posted"),
            inArray(journalLines.accountId, ids),
            gte(journalLines.date, period.from),
            lte(journalLines.date, period.to)
          )
        )
        .groupBy(journalEntries.id, journalEntries.sourceType)
    : [];

  const groups = new Map<JournalSource, CashFlowRow>();
  let internalCount = 0;
  for (const e of byEntry) {
    const net = round2(e.net);
    if (net === 0) {
      internalCount++; // money moved between our own cash/bank accounts
      continue;
    }
    const g = groups.get(e.sourceType) ?? { sourceType: e.sourceType, inflow: 0, outflow: 0, net: 0, count: 0 };
    if (net > 0) g.inflow = round2(g.inflow + net);
    else g.outflow = round2(g.outflow - net);
    g.net = round2(g.inflow - g.outflow);
    g.count++;
    groups.set(e.sourceType, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.inflow + b.outflow - (a.inflow + a.outflow));
  const opening = round2(perAccount.reduce((s, a) => s + a.opening, 0));
  const totalIn = round2(rows.reduce((s, r) => s + r.inflow, 0));
  const totalOut = round2(rows.reduce((s, r) => s + r.outflow, 0));
  const closing = round2(opening + totalIn - totalOut);
  return { ...period, opening, rows, totalIn, totalOut, net: round2(totalIn - totalOut), closing, internalCount, accounts: perAccount };
}
export type CashFlow = Awaited<ReturnType<typeof cashFlow>>;

// ---- General ledger ---------------------------------------------------------------------------

export async function partyNames(db: DbOrTx, pairs: { partyType: string | null; partyId: string | null }[]) {
  const map = new Map<string, string>();
  const idsOf = (t: PartyType) => [...new Set(pairs.filter((p) => p.partyType === t && p.partyId).map((p) => p.partyId!))];
  const c = idsOf("customer");
  const s = idsOf("supplier");
  const e = idsOf("employee");
  if (c.length) for (const r of await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, c))) map.set(`customer:${r.id}`, r.name);
  if (s.length) for (const r of await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(inArray(suppliers.id, s))) map.set(`supplier:${r.id}`, r.name);
  if (e.length) for (const r of await db.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, e))) map.set(`employee:${r.id}`, r.name);
  return map;
}

export interface LedgerLine {
  id: string;
  entryId: string;
  date: string;
  number: string;
  sourceType: JournalSource;
  sourceId: string | null;
  sourceNumber: string | null;
  memo: string | null;
  against: string;
  party: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export async function generalLedger(
  db: DbOrTx,
  input: { accountId: string; from: string; to: string; partyType?: PartyType | null; partyId?: string | null }
) {
  const account = await getAccount(db, input.accountId);
  const debitNormal = isDebitNormal(account.type);
  const party = input.partyType && input.partyId ? { partyType: input.partyType, partyId: input.partyId } : {};
  const opening = await accountBalance(db, account.id, { to: addDays(input.from, -1), ...party });

  const where: SQL[] = [
    eq(journalEntries.status, "posted"),
    eq(journalLines.accountId, account.id),
    gte(journalLines.date, input.from),
    lte(journalLines.date, input.to),
  ];
  if (input.partyType && input.partyId) where.push(eq(journalLines.partyType, input.partyType), eq(journalLines.partyId, input.partyId));
  const rows = await db
    .select({
      id: journalLines.id,
      entryId: journalLines.entryId,
      date: journalLines.date,
      debit: journalLines.debit,
      credit: journalLines.credit,
      lineMemo: journalLines.memo,
      partyType: journalLines.partyType,
      partyId: journalLines.partyId,
      number: journalEntries.number,
      sourceType: journalEntries.sourceType,
      sourceId: journalEntries.sourceId,
      sourceNumber: journalEntries.sourceNumber,
      entryMemo: journalEntries.memo,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(...where))
    .orderBy(asc(journalLines.date), asc(journalEntries.number), asc(journalLines.lineNo));

  // The other side of each entry, so the reader can see where the money went
  const entryIds = [...new Set(rows.map((r) => r.entryId))];
  const against = new Map<string, string[]>();
  for (let i = 0; i < entryIds.length; i += 500) {
    const chunk = entryIds.slice(i, i + 500);
    const others = await db
      .select({ entryId: journalLines.entryId, name: accounts.name })
      .from(journalLines)
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(and(inArray(journalLines.entryId, chunk), ne(journalLines.accountId, account.id)))
      .orderBy(asc(journalLines.lineNo));
    for (const o of others) {
      const list = against.get(o.entryId) ?? [];
      if (!list.includes(o.name)) list.push(o.name);
      against.set(o.entryId, list);
    }
  }
  const names = await partyNames(db, rows);

  let running = opening;
  const lines: LedgerLine[] = rows.map((r) => {
    running = round2(running + (debitNormal ? r.debit - r.credit : r.credit - r.debit));
    const others = against.get(r.entryId) ?? [];
    return {
      id: r.id,
      entryId: r.entryId,
      date: r.date,
      number: r.number,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      sourceNumber: r.sourceNumber,
      memo: r.lineMemo ?? r.entryMemo,
      against: others.length > 2 ? `${others.slice(0, 2).join(", ")} +${others.length - 2}` : others.join(", "),
      party: r.partyType && r.partyId ? (names.get(`${r.partyType}:${r.partyId}`) ?? null) : null,
      debit: r.debit,
      credit: r.credit,
      balance: running,
    };
  });
  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return { account, debitNormal, from: input.from, to: input.to, opening, lines, totalDebit, totalCredit, closing: running };
}
export type GeneralLedger = Awaited<ReturnType<typeof generalLedger>>;

