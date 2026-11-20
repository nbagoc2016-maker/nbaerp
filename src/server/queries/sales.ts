import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { round2, round3, today } from "@/lib/format";
import { customerOptions, defaultWarehouseId, productOptions, warehouseOptions } from "@/server/queries/options";
import { openInvoicesFor } from "@/server/services/sales-receipts";

// ---- Form lookups -----------------------------------------------------------------------------

/** Price per level and on-hand per warehouse, so forms can switch customer/warehouse without a reload. */
export async function productPriceStock() {
  const prices = await db
    .select({ id: s.products.id, salePrice: s.products.salePrice, wholesalePrice: s.products.wholesalePrice })
    .from(s.products)
    .where(eq(s.products.isActive, true));
  const stock = await db.select({ productId: s.stockBalances.productId, warehouseId: s.stockBalances.warehouseId, qty: s.stockBalances.qty }).from(s.stockBalances);
  const stockMap: Record<string, Record<string, number>> = {};
  for (const r of stock) (stockMap[r.productId] ??= {})[r.warehouseId] = r.qty;
  const priceMap: Record<string, { retail: number; wholesale: number | null }> = {};
  for (const p of prices) priceMap[p.id] = { retail: p.salePrice, wholesale: p.wholesalePrice };
  return { stockMap, priceMap };
}

/** Everything the quotation / order / invoice form needs. */
export async function salesFormData() {
  const [products, ps, customers, warehouses, defaultWh, limits, balances] = await Promise.all([
    productOptions({ mode: "sale" }),
    productPriceStock(),
    customerOptions(),
    warehouseOptions(),
    defaultWarehouseId(),
    db.select({ id: s.customers.id, creditLimit: s.customers.creditLimit }).from(s.customers),
    customerBalances(),
  ]);
  const credit: Record<string, { balance: number; creditLimit: number }> = {};
  for (const c of limits) credit[c.id] = { balance: balances[c.id] ?? 0, creditLimit: c.creditLimit };
  return { products, priceMap: ps.priceMap, stockMap: ps.stockMap, customers, warehouses, defaultWarehouseId: defaultWh, credit };
}

export interface PaymentAccountOption {
  value: string;
  label: string;
  hint: string;
  subtype: "cash" | "bank";
}

/** Cash and bank GL accounts money can be received into (with subtype, so forms can pick a sensible default). */
export async function paymentAccounts(): Promise<PaymentAccountOption[]> {
  const rows = await db
    .select({ id: s.accounts.id, code: s.accounts.code, name: s.accounts.name, subtype: s.accounts.subtype })
    .from(s.accounts)
    .where(and(inArray(s.accounts.subtype, ["cash", "bank"]), eq(s.accounts.isGroup, false), eq(s.accounts.isActive, true)))
    .orderBy(asc(s.accounts.code));
  return rows.map((a) => ({ value: a.id, label: a.name, hint: a.code, subtype: a.subtype as "cash" | "bank" }));
}

// ---- Invoices ---------------------------------------------------------------------------------

export interface InvoiceFilters {
  from: string;
  to: string;
  status?: string;
  payment?: string;
  channel?: string;
}

export async function listInvoices(f: InvoiceFilters) {
  const where: SQL[] = [gte(s.salesInvoices.date, f.from), lte(s.salesInvoices.date, f.to)];
  if (f.status && ["draft", "posted", "void"].includes(f.status)) where.push(eq(s.salesInvoices.status, f.status as "draft"));
  if (f.payment === "overdue") {
    where.push(eq(s.salesInvoices.status, "posted"), ne(s.salesInvoices.paymentStatus, "paid"), sql`${s.salesInvoices.dueDate} < ${today()}`);
  } else if (f.payment && ["unpaid", "partial", "paid"].includes(f.payment)) {
    where.push(eq(s.salesInvoices.paymentStatus, f.payment as "paid"), eq(s.salesInvoices.status, "posted"));
  }
  if (f.channel === "pos" || f.channel === "invoice") where.push(eq(s.salesInvoices.channel, f.channel));
  const rows = await db
    .select({
      id: s.salesInvoices.id,
      number: s.salesInvoices.number,
      date: s.salesInvoices.date,
      dueDate: s.salesInvoices.dueDate,
      channel: s.salesInvoices.channel,
      customerId: s.salesInvoices.customerId,
      customerName: s.salesInvoices.customerName,
      warehouse: s.warehouses.name,
      status: s.salesInvoices.status,
      paymentStatus: s.salesInvoices.paymentStatus,
      total: s.salesInvoices.total,
      amountPaid: s.salesInvoices.amountPaid,
      costTotal: s.salesInvoices.costTotal,
    })
    .from(s.salesInvoices)
    .leftJoin(s.warehouses, eq(s.warehouses.id, s.salesInvoices.warehouseId))
    .where(and(...where))
    .orderBy(desc(s.salesInvoices.date), desc(s.salesInvoices.number));
  const t = today();
  return rows.map((r) => ({
    ...r,
    balance: r.status === "posted" ? round2(r.total - r.amountPaid) : 0,
    overdue: r.status === "posted" && r.paymentStatus !== "paid" && !!r.dueDate && r.dueDate < t,
  }));
}

export async function invoiceKpis(from: string, to: string) {
  const t = today();
  const [period] = await db
    .select({
      sales: sql<number>`coalesce(sum(${s.salesInvoices.total}), 0)`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
      cost: sql<number>`coalesce(sum(${s.salesInvoices.costTotal}), 0)`.mapWith(Number),
      net: sql<number>`coalesce(sum(${s.salesInvoices.total} - ${s.salesInvoices.taxTotal} - ${s.salesInvoices.shippingCharges}), 0)`.mapWith(Number),
    })
    .from(s.salesInvoices)
    .where(and(eq(s.salesInvoices.status, "posted"), gte(s.salesInvoices.date, from), lte(s.salesInvoices.date, to)));
  const [open] = await db
    .select({
      unpaid: sql<number>`coalesce(sum(${s.salesInvoices.total} - ${s.salesInvoices.amountPaid}), 0)`.mapWith(Number),
      unpaidCount: sql<number>`count(*)`.mapWith(Number),
      overdue: sql<number>`coalesce(sum(case when ${s.salesInvoices.dueDate} < ${t} then ${s.salesInvoices.total} - ${s.salesInvoices.amountPaid} else 0 end), 0)`.mapWith(Number),
      overdueCount: sql<number>`coalesce(sum(case when ${s.salesInvoices.dueDate} < ${t} then 1 else 0 end), 0)`.mapWith(Number),
    })
    .from(s.salesInvoices)
    .where(and(eq(s.salesInvoices.status, "posted"), ne(s.salesInvoices.paymentStatus, "paid")));
  const margin = period.net > 0 ? ((period.net - period.cost) / period.net) * 100 : 0;
  return {
    sales: round2(period.sales),
    count: period.count,
    margin,
    unpaid: round2(open.unpaid),
    unpaidCount: open.unpaidCount,
    overdue: round2(open.overdue),
    overdueCount: open.overdueCount,
  };
}

export async function getInvoice(id: string) {
  const [inv] = await db.select().from(s.salesInvoices).where(eq(s.salesInvoices.id, id));
  if (!inv) return null;
  const lines = await db
    .select({ line: s.salesInvoiceLines, sku: s.products.sku, unit: s.units.code, allowFraction: s.units.allowFraction, type: s.products.type })
    .from(s.salesInvoiceLines)
    .leftJoin(s.products, eq(s.products.id, s.salesInvoiceLines.productId))
    .leftJoin(s.units, eq(s.units.id, s.products.unitId))
    .where(eq(s.salesInvoiceLines.invoiceId, id))
    .orderBy(asc(s.salesInvoiceLines.lineNo));
  const [warehouse] = await db.select().from(s.warehouses).where(eq(s.warehouses.id, inv.warehouseId));
  const customer = inv.customerId ? (await db.select().from(s.customers).where(eq(s.customers.id, inv.customerId)))[0] ?? null : null;
  const payments = await db
    .select({
      id: s.customerReceipts.id,
      number: s.customerReceipts.number,
      date: s.customerReceipts.date,
      method: s.customerReceipts.method,
      status: s.customerReceipts.status,
      amount: s.receiptAllocations.amount,
      account: s.accounts.name,
    })
    .from(s.receiptAllocations)
    .innerJoin(s.customerReceipts, eq(s.customerReceipts.id, s.receiptAllocations.receiptId))
    .leftJoin(s.accounts, eq(s.accounts.id, s.customerReceipts.depositAccountId))
    .where(eq(s.receiptAllocations.invoiceId, id))
    .orderBy(asc(s.customerReceipts.date));
  const returns = await db
    .select({ id: s.salesReturns.id, number: s.salesReturns.number, date: s.salesReturns.date, status: s.salesReturns.status, settlement: s.salesReturns.settlement, total: s.salesReturns.total })
    .from(s.salesReturns)
    .where(eq(s.salesReturns.invoiceId, id))
    .orderBy(asc(s.salesReturns.date));
  const order = inv.salesOrderId ? (await db.select({ id: s.salesOrders.id, number: s.salesOrders.number }).from(s.salesOrders).where(eq(s.salesOrders.id, inv.salesOrderId)))[0] ?? null : null;
  const journal = inv.journalEntryId
    ? (await db.select({ id: s.journalEntries.id, number: s.journalEntries.number, status: s.journalEntries.status }).from(s.journalEntries).where(eq(s.journalEntries.id, inv.journalEntryId)))[0] ?? null
    : null;
  return {
    invoice: inv,
    lines: lines.map((r) => ({ ...r.line, sku: r.sku, unit: r.unit, allowFraction: r.allowFraction ?? true, type: r.type })),
    warehouse,
    customer,
    payments,
    returns,
    order,
    journal,
    returnable: lines.some((r) => round3(r.line.qty - r.line.returnedQty) > 0),
  };
}

// ---- Quotations -------------------------------------------------------------------------------

export async function listQuotations(from: string, to: string) {
  const rows = await db
    .select({
      id: s.quotations.id,
      number: s.quotations.number,
      date: s.quotations.date,
      validUntil: s.quotations.validUntil,
      customerName: s.quotations.customerName,
      customerId: s.quotations.customerId,
      status: s.quotations.status,
      total: s.quotations.total,
    })
    .from(s.quotations)
    .where(and(gte(s.quotations.date, from), lte(s.quotations.date, to)))
    .orderBy(desc(s.quotations.date), desc(s.quotations.number));
  const t = today();
  return rows.map((r) => ({ ...r, displayStatus: effectiveQuotationStatus(r.status, r.validUntil, t) }));
}

export function effectiveQuotationStatus(status: string, validUntil: string | null, t = today()) {
  return (status === "draft" || status === "sent") && validUntil && validUntil < t ? "expired" : status;
}

export async function getQuotation(id: string) {
  const [q] = await db.select().from(s.quotations).where(eq(s.quotations.id, id));
  if (!q) return null;
  const lines = await db
    .select({ line: s.quotationLines, sku: s.products.sku, unit: s.units.code })
    .from(s.quotationLines)
    .leftJoin(s.products, eq(s.products.id, s.quotationLines.productId))
    .leftJoin(s.units, eq(s.units.id, s.products.unitId))
    .where(eq(s.quotationLines.quotationId, id))
    .orderBy(asc(s.quotationLines.lineNo));
  const customer = q.customerId ? (await db.select().from(s.customers).where(eq(s.customers.id, q.customerId)))[0] ?? null : null;
  const orders = await db.select({ id: s.salesOrders.id, number: s.salesOrders.number }).from(s.salesOrders).where(eq(s.salesOrders.quotationId, id));
  return { quotation: q, lines: lines.map((r) => ({ ...r.line, sku: r.sku, unit: r.unit })), customer, orders };
}

// ---- Orders -----------------------------------------------------------------------------------

export async function listOrders(from: string, to: string) {
  const rows = await db
    .select({
      id: s.salesOrders.id,
      number: s.salesOrders.number,
      date: s.salesOrders.date,
      deliveryDate: s.salesOrders.deliveryDate,
      customerName: s.customers.name,
      customerId: s.salesOrders.customerId,
      status: s.salesOrders.status,
      total: s.salesOrders.total,
      ordered: sql<number>`coalesce((select sum(l.qty) from sales_order_lines l where l.order_id = "sales_orders"."id"), 0)`.mapWith(Number),
      invoiced: sql<number>`coalesce((select sum(least(l.invoiced_qty, l.qty)) from sales_order_lines l where l.order_id = "sales_orders"."id"), 0)`.mapWith(Number),
    })
    .from(s.salesOrders)
    .innerJoin(s.customers, eq(s.customers.id, s.salesOrders.customerId))
    .where(and(gte(s.salesOrders.date, from), lte(s.salesOrders.date, to)))
    .orderBy(desc(s.salesOrders.date), desc(s.salesOrders.number));
  return rows.map((r) => ({ ...r, fulfilledPct: r.ordered > 0 ? Math.min(100, (r.invoiced / r.ordered) * 100) : 0 }));
}

export async function getOrder(id: string) {
  const [o] = await db.select().from(s.salesOrders).where(eq(s.salesOrders.id, id));
  if (!o) return null;
  const lines = await db
    .select({ line: s.salesOrderLines, sku: s.products.sku, unit: s.units.code, allowFraction: s.units.allowFraction })
    .from(s.salesOrderLines)
    .leftJoin(s.products, eq(s.products.id, s.salesOrderLines.productId))
    .leftJoin(s.units, eq(s.units.id, s.products.unitId))
    .where(eq(s.salesOrderLines.orderId, id))
    .orderBy(asc(s.salesOrderLines.lineNo));
  const [customer] = await db.select().from(s.customers).where(eq(s.customers.id, o.customerId));
  const warehouse = o.warehouseId ? (await db.select().from(s.warehouses).where(eq(s.warehouses.id, o.warehouseId)))[0] ?? null : null;
  const invoices = await db
    .select({ id: s.salesInvoices.id, number: s.salesInvoices.number, date: s.salesInvoices.date, status: s.salesInvoices.status, paymentStatus: s.salesInvoices.paymentStatus, total: s.salesInvoices.total })
    .from(s.salesInvoices)
    .where(eq(s.salesInvoices.salesOrderId, id))
    .orderBy(asc(s.salesInvoices.date));
  const quotation = o.quotationId ? (await db.select({ id: s.quotations.id, number: s.quotations.number }).from(s.quotations).where(eq(s.quotations.id, o.quotationId)))[0] ?? null : null;
  return {
    order: o,
    lines: lines.map((r) => ({ ...r.line, sku: r.sku, unit: r.unit, allowFraction: r.allowFraction ?? true, remaining: Math.max(0, round3(r.line.qty - r.line.invoicedQty)) })),
    customer,
    warehouse,
    invoices,
    quotation,
  };
}

// ---- Receipts ---------------------------------------------------------------------------------

export async function listReceipts(from: string, to: string) {
  const rows = await db
    .select({
      id: s.customerReceipts.id,
      number: s.customerReceipts.number,
      date: s.customerReceipts.date,
      customerId: s.customerReceipts.customerId,
      customerName: s.customers.name,
      method: s.customerReceipts.method,
      account: s.accounts.name,
      reference: s.customerReceipts.reference,
      amount: s.customerReceipts.amount,
      status: s.customerReceipts.status,
      notes: s.customerReceipts.notes,
      allocated: sql<number>`coalesce((select sum(ra.amount) from receipt_allocations ra where ra.receipt_id = "customer_receipts"."id"), 0)`.mapWith(Number),
    })
    .from(s.customerReceipts)
    .leftJoin(s.customers, eq(s.customers.id, s.customerReceipts.customerId))
    .leftJoin(s.accounts, eq(s.accounts.id, s.customerReceipts.depositAccountId))
    .where(and(gte(s.customerReceipts.date, from), lte(s.customerReceipts.date, to)))
    .orderBy(desc(s.customerReceipts.date), desc(s.customerReceipts.number));
  return rows.map((r) => ({ ...r, customerName: r.customerName ?? "Walk-in customer", unallocated: round2(r.amount - r.allocated) }));
}

export async function getReceipt(id: string) {
  const [r] = await db.select().from(s.customerReceipts).where(eq(s.customerReceipts.id, id));
  if (!r) return null;
  const customer = r.customerId ? (await db.select().from(s.customers).where(eq(s.customers.id, r.customerId)))[0] ?? null : null;
  const [account] = await db.select().from(s.accounts).where(eq(s.accounts.id, r.depositAccountId));
  const allocations = await db
    .select({
      invoiceId: s.receiptAllocations.invoiceId,
      amount: s.receiptAllocations.amount,
      number: s.salesInvoices.number,
      date: s.salesInvoices.date,
      total: s.salesInvoices.total,
    })
    .from(s.receiptAllocations)
    .innerJoin(s.salesInvoices, eq(s.salesInvoices.id, s.receiptAllocations.invoiceId))
    .where(eq(s.receiptAllocations.receiptId, id));
  return { receipt: r, customer, account, allocations, allocated: round2(allocations.reduce((x, a) => x + a.amount, 0)) };
}

export async function openInvoices(customerId: string | null) {
  return openInvoicesFor(db, customerId);
}

/** Open invoices for every customer (and walk-in), for the receipt form's client-side switching. */
export async function allOpenInvoices() {
  const rows = await db
    .select({
      id: s.salesInvoices.id,
      number: s.salesInvoices.number,
      date: s.salesInvoices.date,
      dueDate: s.salesInvoices.dueDate,
      customerId: s.salesInvoices.customerId,
      customerName: s.salesInvoices.customerName,
      total: s.salesInvoices.total,
      amountPaid: s.salesInvoices.amountPaid,
    })
    .from(s.salesInvoices)
    .where(and(eq(s.salesInvoices.status, "posted"), ne(s.salesInvoices.paymentStatus, "paid")))
    .orderBy(asc(s.salesInvoices.date), asc(s.salesInvoices.number));
  return rows.map((r) => ({ ...r, outstanding: round2(r.total - r.amountPaid) })).filter((r) => r.outstanding > 0.005);
}

/** GL balances for a set of customers (receipt form shows what each owes). */
export async function customerBalances(ids?: string[]) {
  const rows = await db
    .select({
      partyId: s.journalLines.partyId,
      bal: sql<number>`coalesce(sum(${s.journalLines.debit} - ${s.journalLines.credit}), 0)`.mapWith(Number),
    })
    .from(s.journalLines)
    .where(
      and(
        eq(s.journalLines.partyType, "customer"),
        sql`${s.journalLines.entryId} in (select id from journal_entries where status = 'posted')`,
        ids?.length ? inArray(s.journalLines.partyId, ids) : undefined
      )
    )
    .groupBy(s.journalLines.partyId);
  return Object.fromEntries(rows.map((r) => [r.partyId!, round2(r.bal)]));
}

// ---- Returns ----------------------------------------------------------------------------------

export async function listReturns(from: string, to: string) {
  return db
    .select({
      id: s.salesReturns.id,
      number: s.salesReturns.number,
      date: s.salesReturns.date,
      invoiceId: s.salesReturns.invoiceId,
      invoiceNumber: s.salesInvoices.number,
      customerName: s.salesReturns.customerName,
      settlement: s.salesReturns.settlement,
      status: s.salesReturns.status,
      total: s.salesReturns.total,
      reason: s.salesReturns.reason,
    })
    .from(s.salesReturns)
    .leftJoin(s.salesInvoices, eq(s.salesInvoices.id, s.salesReturns.invoiceId))
    .where(and(gte(s.salesReturns.date, from), lte(s.salesReturns.date, to)))
    .orderBy(desc(s.salesReturns.date), desc(s.salesReturns.number));
}

export async function getReturn(id: string) {
  const [r] = await db.select().from(s.salesReturns).where(eq(s.salesReturns.id, id));
  if (!r) return null;
  const lines = await db
    .select({ line: s.salesReturnLines, sku: s.products.sku, unit: s.units.code })
    .from(s.salesReturnLines)
    .leftJoin(s.products, eq(s.products.id, s.salesReturnLines.productId))
    .leftJoin(s.units, eq(s.units.id, s.products.unitId))
    .where(eq(s.salesReturnLines.returnId, id))
    .orderBy(asc(s.salesReturnLines.lineNo));
  const invoice = r.invoiceId ? (await db.select().from(s.salesInvoices).where(eq(s.salesInvoices.id, r.invoiceId)))[0] ?? null : null;
  const refundAccount = r.refundAccountId ? (await db.select().from(s.accounts).where(eq(s.accounts.id, r.refundAccountId)))[0] ?? null : null;
  const [warehouse] = await db.select().from(s.warehouses).where(eq(s.warehouses.id, r.warehouseId));
  return { ret: r, lines: lines.map((x) => ({ ...x.line, sku: x.sku, unit: x.unit })), invoice, refundAccount, warehouse };
}

/** Posted invoices that still have something returnable (for the "new return" picker). */
export async function returnableInvoices() {
  return db
    .select({
      id: s.salesInvoices.id,
      number: s.salesInvoices.number,
      date: s.salesInvoices.date,
      customerName: s.salesInvoices.customerName,
      total: s.salesInvoices.total,
    })
    .from(s.salesInvoices)
    .where(
      and(
        eq(s.salesInvoices.status, "posted"),
        sql`exists (select 1 from sales_invoice_lines l where l.invoice_id = "sales_invoices"."id" and l.qty > l.returned_qty)`
      )
    )
    .orderBy(desc(s.salesInvoices.date), desc(s.salesInvoices.number))
    .limit(500);
}
