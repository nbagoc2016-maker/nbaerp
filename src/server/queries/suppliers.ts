import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { addDays, round2, today } from "@/lib/format";
import { partyBalance } from "@/server/services/accounting";

const postedEntry = sql`${s.journalLines.entryId} in (select id from journal_entries where status = 'posted')`;

/** Payable balance per supplier straight from the GL party lines (what we owe them; negative = advance). */
export async function supplierBalances(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      partyId: s.journalLines.partyId,
      balance: sql<number>`coalesce(sum(${s.journalLines.credit}) - sum(${s.journalLines.debit}), 0)`.mapWith(Number),
    })
    .from(s.journalLines)
    .where(and(eq(s.journalLines.partyType, "supplier"), postedEntry))
    .groupBy(s.journalLines.partyId);
  return new Map(rows.map((r) => [r.partyId ?? "", round2(r.balance)]));
}

/** Open (posted, not fully paid) bill amounts, split by due status. */
async function openBillBuckets(supplierId?: string) {
  const t = today();
  const week = addDays(t, 7);
  const rows = await db
    .select({
      supplierId: s.supplierBills.supplierId,
      outstanding: sql<number>`sum(${s.supplierBills.total} - ${s.supplierBills.amountPaid})`.mapWith(Number),
      overdue: sql<number>`coalesce(sum(case when ${s.supplierBills.dueDate} < ${t} then ${s.supplierBills.total} - ${s.supplierBills.amountPaid} else 0 end), 0)`.mapWith(Number),
      dueWeek: sql<number>`coalesce(sum(case when ${s.supplierBills.dueDate} >= ${t} and ${s.supplierBills.dueDate} <= ${week} then ${s.supplierBills.total} - ${s.supplierBills.amountPaid} else 0 end), 0)`.mapWith(Number),
      overdueCount: sql<number>`count(*) filter (where ${s.supplierBills.dueDate} < ${t})`.mapWith(Number),
      dueWeekCount: sql<number>`count(*) filter (where ${s.supplierBills.dueDate} >= ${t} and ${s.supplierBills.dueDate} <= ${week})`.mapWith(Number),
    })
    .from(s.supplierBills)
    .where(
      and(
        eq(s.supplierBills.status, "posted"),
        ne(s.supplierBills.paymentStatus, "paid"),
        supplierId ? eq(s.supplierBills.supplierId, supplierId) : undefined
      )
    )
    .groupBy(s.supplierBills.supplierId);
  return rows;
}

export type SupplierRow = Awaited<ReturnType<typeof listSuppliers>>[number];

export async function listSuppliers() {
  const [rows, balances, buckets] = await Promise.all([
    db.select().from(s.suppliers).orderBy(asc(s.suppliers.name)),
    supplierBalances(),
    openBillBuckets(),
  ]);
  const byS = new Map(buckets.map((b) => [b.supplierId, b]));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    phone: r.phone,
    city: r.city,
    contactPerson: r.contactPerson,
    paymentTermsDays: r.paymentTermsDays,
    isActive: r.isActive,
    balance: balances.get(r.id) ?? 0,
    overdue: round2(byS.get(r.id)?.overdue ?? 0),
  }));
}

export async function supplierKpis() {
  const [balances, buckets] = await Promise.all([supplierBalances(), openBillBuckets()]);
  const sum = (f: (b: (typeof buckets)[number]) => number) => round2(buckets.reduce((t, b) => t + f(b), 0));
  return {
    totalPayable: round2([...balances.values()].filter((v) => v > 0).reduce((t, v) => t + v, 0)),
    advances: round2([...balances.values()].filter((v) => v < 0).reduce((t, v) => t - v, 0)),
    dueWeek: sum((b) => b.dueWeek),
    dueWeekCount: sum((b) => b.dueWeekCount),
    overdue: sum((b) => b.overdue),
    overdueCount: sum((b) => b.overdueCount),
    suppliersOwed: [...balances.values()].filter((v) => v > 0).length,
  };
}

export async function getSupplier(id: string) {
  const [row] = await db.select().from(s.suppliers).where(eq(s.suppliers.id, id));
  return row ?? null;
}

export async function supplierOverview(id: string) {
  const [balance, buckets, lastBill, lastPayment, counts] = await Promise.all([
    partyBalance(db, "supplier", id),
    openBillBuckets(id),
    db
      .select({ date: s.supplierBills.date, total: s.supplierBills.total, number: s.supplierBills.number, id: s.supplierBills.id })
      .from(s.supplierBills)
      .where(and(eq(s.supplierBills.supplierId, id), eq(s.supplierBills.status, "posted")))
      .orderBy(desc(s.supplierBills.date))
      .limit(1),
    db
      .select({ date: s.supplierPayments.date, amount: s.supplierPayments.amount, number: s.supplierPayments.number, id: s.supplierPayments.id })
      .from(s.supplierPayments)
      .where(and(eq(s.supplierPayments.supplierId, id), eq(s.supplierPayments.status, "posted")))
      .orderBy(desc(s.supplierPayments.date))
      .limit(1),
    db
      .select({
        purchases: sql<number>`coalesce(sum(${s.supplierBills.total}) filter (where ${s.supplierBills.date} >= ${addDays(today(), -365)}), 0)`.mapWith(Number),
        bills: sql<number>`count(*)`.mapWith(Number),
      })
      .from(s.supplierBills)
      .where(and(eq(s.supplierBills.supplierId, id), eq(s.supplierBills.status, "posted"))),
  ]);
  const b = buckets[0];
  return {
    balance,
    openBills: round2(b?.outstanding ?? 0),
    overdue: round2(b?.overdue ?? 0),
    dueWeek: round2(b?.dueWeek ?? 0),
    lastBill: lastBill[0] ?? null,
    lastPayment: lastPayment[0] ?? null,
    purchases12m: round2(counts[0]?.purchases ?? 0),
    billCount: counts[0]?.bills ?? 0,
  };
}

const SOURCE_HREF: Partial<Record<string, string>> = {
  supplier_bill: "/purchasing/bills/",
  supplier_payment: "/purchasing/payments/",
  purchase_return: "/purchasing/returns/",
  goods_receipt: "/purchasing/receipts/",
};

const SOURCE_LABEL: Record<string, string> = {
  opening: "Opening balance",
  supplier_bill: "Bill",
  supplier_payment: "Payment",
  purchase_return: "Purchase return",
  manual: "Journal",
  expense: "Expense",
};

/** Supplier statement from GL party lines: opening, each movement with running balance, closing. */
export async function supplierStatement(id: string, from: string, to: string) {
  const opening = await partyBalance(db, "supplier", id, addDays(from, -1));
  const rows = await db
    .select({
      id: s.journalLines.id,
      date: s.journalLines.date,
      debit: s.journalLines.debit,
      credit: s.journalLines.credit,
      memo: s.journalLines.memo,
      entryMemo: s.journalEntries.memo,
      entryNumber: s.journalEntries.number,
      sourceType: s.journalEntries.sourceType,
      sourceId: s.journalEntries.sourceId,
      sourceNumber: s.journalEntries.sourceNumber,
    })
    .from(s.journalLines)
    .innerJoin(s.journalEntries, eq(s.journalEntries.id, s.journalLines.entryId))
    .where(
      and(
        eq(s.journalLines.partyType, "supplier"),
        eq(s.journalLines.partyId, id),
        eq(s.journalEntries.status, "posted"),
        gte(s.journalLines.date, from),
        lte(s.journalLines.date, to)
      )
    )
    .orderBy(asc(s.journalLines.date), asc(s.journalEntries.createdAt), asc(s.journalLines.lineNo));

  let running = opening;
  const lines = rows.map((r) => {
    running = round2(running + r.credit - r.debit);
    const base = SOURCE_HREF[r.sourceType];
    return {
      ...r,
      type: SOURCE_LABEL[r.sourceType] ?? r.sourceType.replace(/_/g, " "),
      reference: r.sourceNumber ?? r.entryNumber,
      description: r.memo ?? r.entryMemo ?? "",
      href: base && r.sourceId ? `${base}${r.sourceId}` : null,
      balance: running,
    };
  });
  const totalDebit = round2(rows.reduce((t, r) => t + r.debit, 0));
  const totalCredit = round2(rows.reduce((t, r) => t + r.credit, 0));
  return { opening, lines, totalDebit, totalCredit, closing: round2(opening + totalCredit - totalDebit) };
}

export async function supplierNames(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: s.suppliers.id, name: s.suppliers.name }).from(s.suppliers).where(inArray(s.suppliers.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Date of the supplier's posted opening-balance journal, if any. */
export async function supplierOpeningDate(id: string): Promise<string | null> {
  const [row] = await db
    .select({ date: s.journalEntries.date })
    .from(s.journalEntries)
    .where(and(eq(s.journalEntries.sourceType, "opening"), eq(s.journalEntries.sourceId, id), eq(s.journalEntries.status, "posted")))
    .limit(1);
  return row?.date ?? null;
}
