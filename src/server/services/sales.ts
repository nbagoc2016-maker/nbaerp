// Sales invoices and the helpers every sales document shares (line building, customer lookup,
// payment status, sales-order fulfilment).
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  customerReceipts,
  customers,
  products,
  receiptAllocations,
  salesInvoiceLines,
  salesInvoices,
  salesOrderLines,
  salesOrders,
  salesReturns,
  units,
  warehouses,
} from "@/db/schema";
import { calcDocument, calcLine, type CalcTotals } from "@/lib/doc-calc";
import { addDays, formatMoney, round2, round3, today } from "@/lib/format";
import type { DocLinesInput } from "@/lib/schemas";
import { AppError } from "../errors";
import { assertNotLocked, partyBalance, postJournal, voidJournal, type JournalLineInput } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { nextNumber } from "./numbering";
import { paymentStatusFor, type InvoiceInput } from "./sales-schemas";
import { moveStock, reverseStockForSource } from "./stock";

export interface SaleOptions {
  /** Holder of "sales.discount" may sell below a product's minimum price */
  allowBelowMin?: boolean;
}

type PricingOptions = SaleOptions & {
  /** Wholesale customers may buy at the product's wholesale price even when it's under the minimum */
  priceLevel?: "retail" | "wholesale" | null;
};

type LineIn = DocLinesInput["lines"][number];

/**
 * Validate and price sales lines on the server: products exist, whole-unit items aren't sold in
 * fractions, prices respect the minimum (unless allowed), and totals come from calcDocument.
 */
export async function buildSaleLines(
  db: DbOrTx,
  input: { lines: LineIn[]; documentDiscount?: number; charges?: number },
  opts: PricingOptions = {}
) {
  if (!input.lines.length) throw new AppError("Add at least one line");
  const calc = calcDocument(
    input.lines.map((l) => ({ qty: l.qty, price: l.price, discountPct: l.discountPct, taxRate: l.taxRate })),
    { documentDiscount: input.documentDiscount, charges: input.charges }
  );
  const ids = [...new Set(input.lines.map((l) => l.productId).filter((x): x is string => !!x))];
  const prows = ids.length
    ? await db
        .select({
          id: products.id,
          name: products.name,
          type: products.type,
          minSalePrice: products.minSalePrice,
          wholesalePrice: products.wholesalePrice,
          allowFraction: units.allowFraction,
          unit: units.code,
        })
        .from(products)
        .innerJoin(units, eq(units.id, products.unitId))
        .where(inArray(products.id, ids))
    : [];
  const byId = new Map(prows.map((p) => [p.id, p]));
  input.lines.forEach((l, i) => {
    if (l.qty <= 0) throw new AppError(`Line ${i + 1}: quantity must be more than zero`);
    if (!l.productId) return;
    const p = byId.get(l.productId);
    if (!p) throw new AppError(`Line ${i + 1}: product not found`);
    if (!p.allowFraction && Math.abs(l.qty - Math.round(l.qty)) > 0.0005) {
      throw new AppError(`Line ${i + 1}: "${p.name}" is sold in whole ${p.unit}`);
    }
    const effective = round2(l.price * (1 - (l.discountPct ?? 0) / 100));
    const floor = opts.priceLevel === "wholesale" && p.wholesalePrice ? Math.min(p.minSalePrice, p.wholesalePrice) : p.minSalePrice;
    if (!opts.allowBelowMin && floor > 0 && effective < floor - 0.005) {
      throw new AppError(
        `Line ${i + 1}: "${p.name}" can't be sold below ${formatMoney(floor)} (price after discount is ${formatMoney(effective)}). A user with discount approval must make this sale.`
      );
    }
  });
  const rows = input.lines.map((l, i) => ({
    lineNo: i + 1,
    productId: l.productId ?? null,
    description: l.description,
    qty: round3(l.qty),
    unitPrice: round2(l.price),
    discountPct: l.discountPct ?? 0,
    discountAmount: calc.lines[i].discountAmount,
    taxRate: l.taxRate ?? 0,
    taxAmount: calc.lines[i].taxAmount,
    lineTotal: calc.lines[i].lineTotal,
  }));
  return { calc, rows, products: byId };
}

export function totalsFrom(calc: CalcTotals) {
  return {
    subtotal: calc.subtotal,
    discountTotal: calc.discountTotal,
    documentDiscount: calc.documentDiscount,
    taxTotal: calc.taxTotal,
    shippingCharges: calc.charges,
    roundOff: calc.roundOff,
    total: calc.total,
  };
}

/** Stored line -> editor/calc line */
export const toCalcLine = (l: { productId: string | null; description: string; qty: number; unitPrice: number; discountPct: number; taxRate: number }) => ({
  productId: l.productId,
  description: l.description,
  qty: l.qty,
  price: l.unitPrice,
  discountPct: l.discountPct,
  taxRate: l.taxRate,
});

export async function resolveCustomer(db: DbOrTx, customerId: string | null | undefined, name?: string | null, phone?: string | null) {
  if (!customerId) return { customer: null, name: name?.trim() || "Walk-in customer", phone: phone ?? null };
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!c) throw new AppError("Customer not found");
  if (!c.isActive) throw new AppError(`Customer "${c.name}" is inactive`);
  return { customer: c, name: c.name, phone: phone ?? c.phone };
}

export async function assertWarehouse(db: DbOrTx, warehouseId: string) {
  const [w] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId));
  if (!w) throw new AppError("Warehouse not found");
  if (!w.isActive) throw new AppError(`Warehouse "${w.name}" is inactive`);
  return w;
}

export async function getDefaultWarehouseId(db: DbOrTx) {
  const [w] = await db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.isActive, true), eq(warehouses.isDefault, true)))
    .limit(1);
  if (w) return w.id;
  const [any] = await db.select().from(warehouses).where(eq(warehouses.isActive, true)).limit(1);
  if (!any) throw new AppError("Set up a warehouse first");
  return any.id;
}

// ---- Payment status ---------------------------------------------------------------------------

/**
 * Recompute what has been settled on an invoice: allocations from posted receipts plus posted
 * credit-note returns (capped at the invoice total). Keeps amountPaid / paymentStatus in step.
 */
export async function refreshInvoicePayment(db: DbOrTx, invoiceId: string) {
  const [inv] = await db.select({ total: salesInvoices.total }).from(salesInvoices).where(eq(salesInvoices.id, invoiceId));
  if (!inv) throw new AppError("Invoice not found");
  const [a] = await db
    .select({ sum: sql<number>`coalesce(sum(${receiptAllocations.amount}), 0)`.mapWith(Number) })
    .from(receiptAllocations)
    .innerJoin(customerReceipts, eq(customerReceipts.id, receiptAllocations.receiptId))
    .where(and(eq(receiptAllocations.invoiceId, invoiceId), eq(customerReceipts.status, "posted")));
  const [r] = await db
    .select({ sum: sql<number>`coalesce(sum(${salesReturns.total}), 0)`.mapWith(Number) })
    .from(salesReturns)
    .where(and(eq(salesReturns.invoiceId, invoiceId), eq(salesReturns.status, "posted"), eq(salesReturns.settlement, "credit")));
  const paid = round2(Math.min(inv.total, a.sum + r.sum));
  await db
    .update(salesInvoices)
    .set({ amountPaid: paid, paymentStatus: paymentStatusFor(inv.total, paid) })
    .where(eq(salesInvoices.id, invoiceId));
  return { total: inv.total, paid, outstanding: round2(inv.total - paid) };
}

// ---- Sales order fulfilment -------------------------------------------------------------------

/**
 * Add (sign +1) or remove (sign -1) invoiced quantities on a sales order's lines, matching
 * invoice lines to order lines by product (or description for free-text lines), then refresh
 * the order status (confirmed / partial / fulfilled).
 */
export async function applyOrderInvoicing(
  db: DbOrTx,
  orderId: string,
  lines: { productId: string | null; description: string; qty: number }[],
  sign: 1 | -1
) {
  const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId));
  if (!order) return;
  const olines = await db.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId)).orderBy(asc(salesOrderLines.lineNo));
  const invoiced = new Map(olines.map((l) => [l.id, l.invoicedQty]));
  for (const l of lines) {
    let rem = round3(l.qty);
    const matches = olines.filter((o) => (l.productId ? o.productId === l.productId : !o.productId && o.description === l.description));
    for (const o of matches) {
      if (rem <= 0) break;
      const cur = invoiced.get(o.id)!;
      const room = sign > 0 ? round3(o.qty - cur) : cur;
      const take = Math.min(room, rem);
      if (take <= 0) continue;
      invoiced.set(o.id, round3(cur + sign * take));
      rem = round3(rem - take);
    }
  }
  for (const o of olines) {
    const v = invoiced.get(o.id)!;
    if (v !== o.invoicedQty) await db.update(salesOrderLines).set({ invoicedQty: v }).where(eq(salesOrderLines.id, o.id));
  }
  if (order.status === "cancelled" || order.status === "draft") return;
  const all = olines.every((o) => invoiced.get(o.id)! >= o.qty - 0.0005);
  const some = olines.some((o) => invoiced.get(o.id)! > 0);
  const status = all ? "fulfilled" : some ? "partial" : "confirmed";
  if (status !== order.status) await db.update(salesOrders).set({ status }).where(eq(salesOrders.id, orderId));
}

// ---- Invoices ---------------------------------------------------------------------------------

export interface SaveInvoiceOptions extends SaleOptions {
  channel?: "pos" | "invoice";
  series?: "SI" | "POS";
}

/** Create or update a draft invoice; with input.post it is posted in the same transaction. */
export async function saveInvoice(db: DbOrTx, actor: Actor | null, input: InvoiceInput, opts: SaveInvoiceOptions = {}) {
  const { customer, name, phone } = await resolveCustomer(db, input.customerId, input.customerName, input.customerPhone);
  await assertWarehouse(db, input.warehouseId);
  const { calc, rows } = await buildSaleLines(db, input, { ...opts, priceLevel: customer?.priceLevel });
  const dueDate = input.dueDate ?? (customer ? addDays(input.date, customer.paymentTermsDays) : input.date);

  const header = {
    date: input.date,
    dueDate,
    customerId: customer?.id ?? null,
    customerName: name,
    customerPhone: phone,
    warehouseId: input.warehouseId,
    salesperson: input.salesperson ?? null,
    notes: input.notes ?? null,
    ...totalsFrom(calc),
  };

  let id: string;
  let number: string;
  if (input.id) {
    const [cur] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, input.id));
    if (!cur) throw new AppError("Invoice not found");
    if (cur.status !== "draft") throw new AppError(`Invoice ${cur.number} is ${cur.status}; only drafts can be edited`);
    await db
      .update(salesInvoices)
      .set({ ...header, salesOrderId: input.salesOrderId ?? cur.salesOrderId })
      .where(eq(salesInvoices.id, cur.id));
    await db.delete(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, cur.id));
    id = cur.id;
    number = cur.number;
    await logAudit(db, actor, { action: "update", entity: "sales_invoice", entityId: id, summary: `Updated draft invoice ${number}` });
  } else {
    number = await nextNumber(db, opts.series ?? "SI");
    const [row] = await db
      .insert(salesInvoices)
      .values({
        ...header,
        number,
        channel: opts.channel ?? "invoice",
        salesOrderId: input.salesOrderId ?? null,
        status: "draft",
        createdBy: actor?.id ?? null,
      })
      .returning();
    id = row.id;
    await logAudit(db, actor, { action: "create", entity: "sales_invoice", entityId: id, summary: `Created invoice ${number} for ${name}` });
  }
  await db.insert(salesInvoiceLines).values(rows.map((r) => ({ ...r, invoiceId: id })));

  if (input.post) {
    const res = await postInvoice(db, actor, id, opts);
    return { id, number, warning: res.warning };
  }
  return { id, number, warning: null as string | null };
}

/**
 * Post a draft invoice: stock leaves the warehouse at moving-average cost, then
 *   Dr Receivable (customer) total; Cr Sales net; Cr Output tax; Cr Other income (charges)
 *   Dr COGS / Cr Inventory at cost.
 * Returns a warning (not an error) when the customer goes over their credit limit.
 */
export async function postInvoice(db: DbOrTx, actor: Actor | null, id: string, opts: SaleOptions = {}) {
  const [inv] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id));
  if (!inv) throw new AppError("Invoice not found");
  if (inv.status !== "draft") throw new AppError(`Invoice ${inv.number} is already ${inv.status}`);
  const lines = await db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id)).orderBy(asc(salesInvoiceLines.lineNo));
  if (!lines.length) throw new AppError("Add at least one line before posting");
  await assertNotLocked(db, inv.date);
  await assertWarehouse(db, inv.warehouseId);

  const c = inv.customerId ? (await db.select().from(customers).where(eq(customers.id, inv.customerId)))[0] : undefined;
  // Always recompute on the server from the stored lines
  const { calc } = await buildSaleLines(
    db,
    { lines: lines.map(toCalcLine), documentDiscount: inv.documentDiscount, charges: inv.shippingCharges },
    { ...opts, priceLevel: c?.priceLevel }
  );

  let warning: string | null = null;
  if (c && c.creditLimit > 0) {
    const balance = await partyBalance(db, "customer", c.id);
    const after = round2(balance + calc.total);
    if (after > c.creditLimit + 0.005) {
      warning = `${c.name} is over their credit limit: balance ${formatMoney(after)} vs limit ${formatMoney(c.creditLimit)}.`;
    }
  }

  let cost = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let unitCost = 0;
    if (l.productId) {
      const res = await moveStock(db, actor, {
        date: inv.date,
        productId: l.productId,
        warehouseId: inv.warehouseId,
        qty: -l.qty,
        batchId: l.batchId,
        sourceType: "sales_invoice",
        sourceId: inv.id,
        sourceNumber: inv.number,
      });
      unitCost = res.unitCost;
      cost = round2(cost - res.value);
    }
    const c = calc.lines[i];
    await db
      .update(salesInvoiceLines)
      .set({ unitCost, discountAmount: c.discountAmount, taxAmount: c.taxAmount, lineTotal: c.lineTotal })
      .where(eq(salesInvoiceLines.id, l.id));
  }

  const party = inv.customerId ? { partyType: "customer" as const, partyId: inv.customerId } : {};
  const jl: JournalLineInput[] = [
    { account: ACC.RECEIVABLE, debit: calc.total, ...party, memo: inv.customerName },
    { account: ACC.SALES, credit: calc.netBeforeTax },
    { account: ACC.OUTPUT_TAX, credit: calc.taxTotal },
    { account: ACC.OTHER_INCOME, credit: calc.charges, memo: "Delivery charges" },
  ];
  if (calc.roundOff > 0) jl.push({ account: ACC.OTHER_INCOME, credit: calc.roundOff, memo: "Round off" });
  if (calc.roundOff < 0) jl.push({ account: ACC.DISCOUNT_ALLOWED, debit: -calc.roundOff, memo: "Round off" });
  if (cost > 0) jl.push({ account: ACC.COGS, debit: cost }, { account: ACC.INVENTORY, credit: cost });

  let journalEntryId: string | null = null;
  if (jl.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0).length >= 2) {
    const entry = await postJournal(db, actor, {
      date: inv.date,
      memo: `${inv.channel === "pos" ? "POS sale" : "Sales invoice"} ${inv.number} — ${inv.customerName}`,
      sourceType: "sales_invoice",
      sourceId: inv.id,
      sourceNumber: inv.number,
      lines: jl,
    });
    journalEntryId = entry.id;
  }

  await db
    .update(salesInvoices)
    .set({ ...totalsFrom(calc), status: "posted", postedAt: new Date(), journalEntryId, costTotal: cost })
    .where(eq(salesInvoices.id, id));

  if (inv.salesOrderId) await applyOrderInvoicing(db, inv.salesOrderId, lines, 1);
  await refreshInvoicePayment(db, id);
  await logAudit(db, actor, {
    action: "post",
    entity: "sales_invoice",
    entityId: id,
    summary: `Posted ${inv.number} for ${inv.customerName}: ${formatMoney(calc.total)}`,
  });
  return { id, number: inv.number, total: calc.total, cost, warning };
}

/**
 * Void a posted invoice: stock comes back, the journal is voided. Not allowed while receipts are
 * allocated to it or returns are posted against it (void those first).
 */
export async function voidInvoice(db: DbOrTx, actor: Actor | null, id: string, reason?: string | null) {
  const [inv] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id));
  if (!inv) throw new AppError("Invoice not found");
  if (inv.status !== "posted") throw new AppError(`Only posted invoices can be voided (this one is ${inv.status})`);

  const allocs = await db
    .select({ number: customerReceipts.number })
    .from(receiptAllocations)
    .innerJoin(customerReceipts, eq(customerReceipts.id, receiptAllocations.receiptId))
    .where(and(eq(receiptAllocations.invoiceId, id), eq(customerReceipts.status, "posted")));
  if (allocs.length) {
    throw new AppError(`Payments are recorded against this invoice (${[...new Set(allocs.map((a) => a.number))].join(", ")}). Void those receipts first.`);
  }
  const rets = await db
    .select({ number: salesReturns.number })
    .from(salesReturns)
    .where(and(eq(salesReturns.invoiceId, id), ne(salesReturns.status, "void")));
  if (rets.length) throw new AppError(`Returns exist against this invoice (${rets.map((r) => r.number).join(", ")}). Void or delete them first.`);

  await voidJournal(db, actor, inv.journalEntryId, reason ?? `Invoice ${inv.number} voided`);
  await reverseStockForSource(db, actor, "sales_invoice", id, today());
  await db.update(salesInvoices).set({ status: "void" }).where(eq(salesInvoices.id, id));

  if (inv.salesOrderId) {
    const lines = await db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));
    await applyOrderInvoicing(db, inv.salesOrderId, lines, -1);
  }
  await logAudit(db, actor, {
    action: "void",
    entity: "sales_invoice",
    entityId: id,
    summary: `Voided invoice ${inv.number}${reason ? `: ${reason}` : ""}`,
  });
  return { id };
}

export async function deleteDraftInvoice(db: DbOrTx, actor: Actor | null, id: string) {
  const [inv] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id));
  if (!inv) throw new AppError("Invoice not found");
  if (inv.status !== "draft") throw new AppError("Only draft invoices can be deleted; void posted ones instead");
  await db.delete(salesInvoices).where(eq(salesInvoices.id, id));
  await logAudit(db, actor, { action: "delete", entity: "sales_invoice", entityId: id, summary: `Deleted draft invoice ${inv.number}` });
  return { id };
}

/** Per-line display amounts before the bill discount is spread (for printing). */
export function displayLine(l: { qty: number; unitPrice: number; discountPct: number; taxRate: number }) {
  return calcLine({ qty: l.qty, price: l.unitPrice, discountPct: l.discountPct, taxRate: l.taxRate });
}
