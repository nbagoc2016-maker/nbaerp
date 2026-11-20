import "server-only";
import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { round2, today } from "@/lib/format";

const postedEntry = sql`${s.journalLines.entryId} in (select id from journal_entries where status = 'posted')`;

/** Correlated subquery: what the customer owes from the GL (receivable lines tagged with them). */
const balanceSql = sql<number>`coalesce((
  select sum(jl.debit - jl.credit) from journal_lines jl
  join journal_entries je on je.id = jl.entry_id
  where je.status = 'posted' and jl.party_type = 'customer' and jl.party_id = "customers"."id"
), 0)`.mapWith(Number);

const overdueSql = (asOf: string) =>
  sql<number>`coalesce((
    select sum(si.total - si.amount_paid) from sales_invoices si
    where si.customer_id = "customers"."id" and si.status = 'posted' and si.payment_status <> 'paid' and si.due_date < ${asOf}
  ), 0)`.mapWith(Number);

export type CustomerRow = Awaited<ReturnType<typeof listCustomers>>[number];

export async function listCustomers() {
  const t = today();
  const rows = await db
    .select({
      id: s.customers.id,
      code: s.customers.code,
      name: s.customers.name,
      type: s.customers.type,
      phone: s.customers.phone,
      city: s.customers.city,
      creditLimit: s.customers.creditLimit,
      paymentTermsDays: s.customers.paymentTermsDays,
      isActive: s.customers.isActive,
      balance: balanceSql,
      overdue: overdueSql(t),
      lastSale: sql<string | null>`(select max(si.date) from sales_invoices si where si.customer_id = "customers"."id" and si.status = 'posted')`,
    })
    .from(s.customers)
    .orderBy(asc(s.customers.name));
  return rows.map((r) => ({ ...r, balance: round2(r.balance), overdue: round2(r.overdue) }));
}

export function customerKpis(rows: CustomerRow[]) {
  return {
    receivable: round2(rows.reduce((sum, r) => sum + Math.max(0, r.balance), 0)),
    credit: round2(rows.reduce((sum, r) => sum + Math.min(0, r.balance), 0)),
    overdue: round2(rows.reduce((sum, r) => sum + r.overdue, 0)),
    overdueCount: rows.filter((r) => r.overdue > 0).length,
    active: rows.filter((r) => r.isActive).length,
    total: rows.length,
  };
}

export async function getCustomer(id: string) {
  const [c] = await db.select().from(s.customers).where(eq(s.customers.id, id));
  if (!c) return null;
  const t = today();
  const [stats] = await db
    .select({
      balance: balanceSql,
      overdue: overdueSql(t),
      totalSales: sql<number>`coalesce((select sum(si.total) from sales_invoices si where si.customer_id = "customers"."id" and si.status = 'posted'), 0)`.mapWith(Number),
      invoiceCount: sql<number>`(select count(*) from sales_invoices si where si.customer_id = "customers"."id" and si.status = 'posted')`.mapWith(Number),
      lastSale: sql<string | null>`(select max(si.date) from sales_invoices si where si.customer_id = "customers"."id" and si.status = 'posted')`,
      totalReceived: sql<number>`coalesce((select sum(cr.amount) from customer_receipts cr where cr.customer_id = "customers"."id" and cr.status = 'posted'), 0)`.mapWith(Number),
      openingPosted: sql<number>`(select count(*) from journal_entries je where je.source_type = 'opening' and je.source_id = "customers"."id" and je.status = 'posted')`.mapWith(Number),
    })
    .from(s.customers)
    .where(eq(s.customers.id, id));
  return {
    ...c,
    balance: round2(stats.balance),
    overdue: round2(stats.overdue),
    totalSales: round2(stats.totalSales),
    invoiceCount: stats.invoiceCount,
    lastSale: stats.lastSale,
    totalReceived: round2(stats.totalReceived),
    openingPosted: stats.openingPosted > 0,
  };
}

/** Customer statement straight from the GL: opening balance, every movement with running balance, closing. */
export async function customerStatement(customerId: string, from: string, to: string) {
  const party = and(eq(s.journalLines.partyType, "customer"), eq(s.journalLines.partyId, customerId), postedEntry);
  const [open] = await db
    .select({ bal: sql<number>`coalesce(sum(${s.journalLines.debit} - ${s.journalLines.credit}), 0)`.mapWith(Number) })
    .from(s.journalLines)
    .where(and(party, lt(s.journalLines.date, from)));
  const rows = await db
    .select({
      id: s.journalLines.id,
      date: s.journalLines.date,
      debit: s.journalLines.debit,
      credit: s.journalLines.credit,
      lineMemo: s.journalLines.memo,
      entryNumber: s.journalEntries.number,
      memo: s.journalEntries.memo,
      sourceType: s.journalEntries.sourceType,
      sourceId: s.journalEntries.sourceId,
      sourceNumber: s.journalEntries.sourceNumber,
    })
    .from(s.journalLines)
    .innerJoin(s.journalEntries, eq(s.journalEntries.id, s.journalLines.entryId))
    .where(and(party, gte(s.journalLines.date, from), lte(s.journalLines.date, to)))
    .orderBy(asc(s.journalLines.date), asc(s.journalEntries.createdAt), asc(s.journalLines.lineNo));
  let running = round2(open.bal);
  const lines = rows.map((r) => {
    running = round2(running + r.debit - r.credit);
    return { ...r, balance: running, href: sourceHref(r.sourceType, r.sourceId) };
  });
  return {
    opening: round2(open.bal),
    debit: round2(rows.reduce((x, r) => x + r.debit, 0)),
    credit: round2(rows.reduce((x, r) => x + r.credit, 0)),
    closing: running,
    lines,
  };
}

export function sourceHref(sourceType: string, sourceId: string | null) {
  if (!sourceId) return null;
  switch (sourceType) {
    case "sales_invoice":
      return `/sales/invoices/${sourceId}`;
    case "customer_receipt":
      return `/sales/receipts/${sourceId}`;
    case "sales_return":
      return `/sales/returns/${sourceId}`;
    default:
      return null;
  }
}

export async function customerInvoices(customerId: string) {
  return db
    .select({
      id: s.salesInvoices.id,
      number: s.salesInvoices.number,
      date: s.salesInvoices.date,
      dueDate: s.salesInvoices.dueDate,
      channel: s.salesInvoices.channel,
      status: s.salesInvoices.status,
      paymentStatus: s.salesInvoices.paymentStatus,
      total: s.salesInvoices.total,
      amountPaid: s.salesInvoices.amountPaid,
    })
    .from(s.salesInvoices)
    .where(eq(s.salesInvoices.customerId, customerId))
    .orderBy(desc(s.salesInvoices.date), desc(s.salesInvoices.number));
}

export async function customerReceiptsList(customerId: string) {
  return db
    .select({
      id: s.customerReceipts.id,
      number: s.customerReceipts.number,
      date: s.customerReceipts.date,
      method: s.customerReceipts.method,
      amount: s.customerReceipts.amount,
      reference: s.customerReceipts.reference,
      status: s.customerReceipts.status,
      account: s.accounts.name,
      allocated: sql<number>`coalesce((select sum(ra.amount) from receipt_allocations ra where ra.receipt_id = "customer_receipts"."id"), 0)`.mapWith(Number),
    })
    .from(s.customerReceipts)
    .leftJoin(s.accounts, eq(s.accounts.id, s.customerReceipts.depositAccountId))
    .where(eq(s.customerReceipts.customerId, customerId))
    .orderBy(desc(s.customerReceipts.date), desc(s.customerReceipts.number));
}
