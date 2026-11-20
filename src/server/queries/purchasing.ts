import "server-only";
import { and, asc, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { addDays, round2, round3, today } from "@/lib/format";
import { returnedQtyByBillLine } from "@/server/services/purchasing-payments";

const productInfo = {
  sku: s.products.sku,
  unit: s.units.code,
  trackBatches: s.products.trackBatches,
  productType: s.products.type,
};

/** Extra product facts the purchasing editors need beyond productOptions(). */
export async function productFlags(): Promise<Record<string, { trackBatches: boolean; type: "stock" | "service" }>> {
  const rows = await db.select({ id: s.products.id, trackBatches: s.products.trackBatches, type: s.products.type }).from(s.products);
  return Object.fromEntries(rows.map((r) => [r.id, { trackBatches: r.trackBatches, type: r.type }]));
}

// ---- Hub KPIs -------------------------------------------------------------------------------

export async function purchasingKpis() {
  const t = today();
  const week = addDays(t, 7);
  const [openPo] = await db
    .select({
      count: sql<number>`count(distinct purchase_orders.id)`.mapWith(Number),
      value: sql<number>`coalesce(sum(case when ${s.purchaseOrderLines.qty} > 0 then ${s.purchaseOrderLines.lineTotal} * greatest(${s.purchaseOrderLines.qty} - ${s.purchaseOrderLines.receivedQty}, 0) / ${s.purchaseOrderLines.qty} else 0 end), 0)`.mapWith(Number),
    })
    .from(s.purchaseOrders)
    .innerJoin(s.purchaseOrderLines, eq(s.purchaseOrderLines.orderId, s.purchaseOrders.id))
    .where(inArray(s.purchaseOrders.status, ["approved", "sent", "partial"]));
  const [drafts] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(s.purchaseOrders)
    .where(eq(s.purchaseOrders.status, "draft"));
  const [unbilled] = await db
    .select({
      value: sql<number>`coalesce(sum(greatest(${s.goodsReceiptLines.qty} - ${s.goodsReceiptLines.billedQty}, 0) * ${s.goodsReceiptLines.unitCost}), 0)`.mapWith(Number),
      count: sql<number>`count(distinct goods_receipts.id) filter (where ${s.goodsReceiptLines.qty} > ${s.goodsReceiptLines.billedQty})`.mapWith(Number),
    })
    .from(s.goodsReceipts)
    .innerJoin(s.goodsReceiptLines, eq(s.goodsReceiptLines.receiptId, s.goodsReceipts.id))
    .where(eq(s.goodsReceipts.status, "posted"));
  const [bills] = await db
    .select({
      dueWeek: sql<number>`coalesce(sum(case when ${s.supplierBills.dueDate} >= ${t} and ${s.supplierBills.dueDate} <= ${week} then ${s.supplierBills.total} - ${s.supplierBills.amountPaid} else 0 end), 0)`.mapWith(Number),
      dueWeekCount: sql<number>`count(*) filter (where ${s.supplierBills.dueDate} >= ${t} and ${s.supplierBills.dueDate} <= ${week})`.mapWith(Number),
      overdue: sql<number>`coalesce(sum(case when ${s.supplierBills.dueDate} < ${t} then ${s.supplierBills.total} - ${s.supplierBills.amountPaid} else 0 end), 0)`.mapWith(Number),
      overdueCount: sql<number>`count(*) filter (where ${s.supplierBills.dueDate} < ${t})`.mapWith(Number),
      open: sql<number>`coalesce(sum(${s.supplierBills.total} - ${s.supplierBills.amountPaid}), 0)`.mapWith(Number),
      openCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(s.supplierBills)
    .where(and(eq(s.supplierBills.status, "posted"), ne(s.supplierBills.paymentStatus, "paid")));
  return {
    openPoCount: openPo.count,
    openPoValue: round2(openPo.value),
    draftPoCount: drafts.count,
    unbilledValue: round2(unbilled.value),
    unbilledCount: unbilled.count,
    dueWeek: round2(bills.dueWeek),
    dueWeekCount: bills.dueWeekCount,
    overdue: round2(bills.overdue),
    overdueCount: bills.overdueCount,
    openBills: round2(bills.open),
    openBillCount: bills.openCount,
  };
}

// ---- Purchase orders ------------------------------------------------------------------------

export type PurchaseOrderRow = Awaited<ReturnType<typeof listPurchaseOrders>>[number];

export async function listPurchaseOrders(opts: { supplierId?: string } = {}) {
  const rows = await db
    .select({
      id: s.purchaseOrders.id,
      number: s.purchaseOrders.number,
      date: s.purchaseOrders.date,
      expectedDate: s.purchaseOrders.expectedDate,
      status: s.purchaseOrders.status,
      total: s.purchaseOrders.total,
      supplierId: s.purchaseOrders.supplierId,
      supplierName: s.suppliers.name,
      warehouseName: s.warehouses.name,
      ordered: sql<number>`coalesce((select sum(qty) from purchase_order_lines l where l.order_id = purchase_orders.id and l.product_id in (select id from products where type = 'stock')), 0)`.mapWith(Number),
      received: sql<number>`coalesce((select sum(least(received_qty, qty)) from purchase_order_lines l where l.order_id = purchase_orders.id and l.product_id in (select id from products where type = 'stock')), 0)`.mapWith(Number),
      billed: sql<number>`coalesce((select sum(least(billed_qty, qty)) from purchase_order_lines l where l.order_id = purchase_orders.id), 0)`.mapWith(Number),
      lineQty: sql<number>`coalesce((select sum(qty) from purchase_order_lines l where l.order_id = purchase_orders.id), 0)`.mapWith(Number),
    })
    .from(s.purchaseOrders)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.purchaseOrders.supplierId))
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.purchaseOrders.warehouseId))
    .where(opts.supplierId ? eq(s.purchaseOrders.supplierId, opts.supplierId) : undefined)
    .orderBy(desc(s.purchaseOrders.date), desc(s.purchaseOrders.number));
  return rows.map((r) => ({
    ...r,
    receivedPct: r.ordered ? Math.round((r.received / r.ordered) * 100) : 0,
    billedPct: r.lineQty ? Math.round((r.billed / r.lineQty) * 100) : 0,
  }));
}

export async function getPurchaseOrder(id: string) {
  const [po] = await db
    .select({ po: s.purchaseOrders, supplier: s.suppliers, warehouse: s.warehouses })
    .from(s.purchaseOrders)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.purchaseOrders.supplierId))
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.purchaseOrders.warehouseId))
    .where(eq(s.purchaseOrders.id, id));
  if (!po) return null;
  const lines = await db
    .select({ line: s.purchaseOrderLines, sku: s.products.sku, unit: s.units.code, productType: s.products.type })
    .from(s.purchaseOrderLines)
    .leftJoin(s.products, eq(s.products.id, s.purchaseOrderLines.productId))
    .leftJoin(s.units, eq(s.units.id, s.products.unitId))
    .where(eq(s.purchaseOrderLines.orderId, id))
    .orderBy(asc(s.purchaseOrderLines.lineNo));
  const [receipts, bills, approver] = await Promise.all([
    db
      .select({ id: s.goodsReceipts.id, number: s.goodsReceipts.number, date: s.goodsReceipts.date, status: s.goodsReceipts.status, total: s.goodsReceipts.totalValue, billStatus: s.goodsReceipts.billStatus })
      .from(s.goodsReceipts)
      .where(eq(s.goodsReceipts.purchaseOrderId, id))
      .orderBy(asc(s.goodsReceipts.date)),
    billsLinkedToOrder(id),
    po.po.approvedBy
      ? db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, po.po.approvedBy)).then((r) => r[0]?.name ?? null)
      : Promise.resolve(null),
  ]);
  return { ...po, lines: lines.map((l) => ({ ...l.line, sku: l.sku, unit: l.unit, isStock: l.productType === "stock" })), receipts, bills, approvedByName: approver };
}

async function billsLinkedToOrder(orderId: string) {
  // Bills on the PO header, or whose lines come from this PO's lines (e.g. billed from a GRN)
  return db
    .select({ id: s.supplierBills.id, number: s.supplierBills.number, date: s.supplierBills.date, status: s.supplierBills.status, total: s.supplierBills.total, paymentStatus: s.supplierBills.paymentStatus })
    .from(s.supplierBills)
    .where(
      or(
        eq(s.supplierBills.purchaseOrderId, orderId),
        sql`${s.supplierBills.id} in (select bl.bill_id from supplier_bill_lines bl join purchase_order_lines pl on pl.id = bl.purchase_order_line_id where pl.order_id = ${orderId})`
      )
    )
    .orderBy(asc(s.supplierBills.date));
}

// ---- Goods receipts -------------------------------------------------------------------------

export type ReceiptRow = Awaited<ReturnType<typeof listReceipts>>[number];

export async function listReceipts(opts: { supplierId?: string } = {}) {
  return db
    .select({
      id: s.goodsReceipts.id,
      number: s.goodsReceipts.number,
      date: s.goodsReceipts.date,
      status: s.goodsReceipts.status,
      billStatus: s.goodsReceipts.billStatus,
      totalValue: s.goodsReceipts.totalValue,
      supplierDeliveryRef: s.goodsReceipts.supplierDeliveryRef,
      supplierId: s.goodsReceipts.supplierId,
      supplierName: s.suppliers.name,
      warehouseName: s.warehouses.name,
      poNumber: s.purchaseOrders.number,
      purchaseOrderId: s.goodsReceipts.purchaseOrderId,
      unbilledValue: sql<number>`coalesce((select sum(greatest(qty - billed_qty, 0) * unit_cost) from goods_receipt_lines l where l.receipt_id = goods_receipts.id), 0)`.mapWith(Number),
    })
    .from(s.goodsReceipts)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.goodsReceipts.supplierId))
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.goodsReceipts.warehouseId))
    .leftJoin(s.purchaseOrders, eq(s.purchaseOrders.id, s.goodsReceipts.purchaseOrderId))
    .where(opts.supplierId ? eq(s.goodsReceipts.supplierId, opts.supplierId) : undefined)
    .orderBy(desc(s.goodsReceipts.date), desc(s.goodsReceipts.number));
}

export async function getReceipt(id: string) {
  const [row] = await db
    .select({ grn: s.goodsReceipts, supplier: s.suppliers, warehouse: s.warehouses, poNumber: s.purchaseOrders.number })
    .from(s.goodsReceipts)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.goodsReceipts.supplierId))
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.goodsReceipts.warehouseId))
    .leftJoin(s.purchaseOrders, eq(s.purchaseOrders.id, s.goodsReceipts.purchaseOrderId))
    .where(eq(s.goodsReceipts.id, id));
  if (!row) return null;
  const lines = await db
    .select({ line: s.goodsReceiptLines, ...productInfo, productName: s.products.name })
    .from(s.goodsReceiptLines)
    .innerJoin(s.products, eq(s.products.id, s.goodsReceiptLines.productId))
    .innerJoin(s.units, eq(s.units.id, s.products.unitId))
    .where(eq(s.goodsReceiptLines.receiptId, id))
    .orderBy(asc(s.goodsReceiptLines.purchaseOrderLineId), asc(s.goodsReceiptLines.productId), asc(s.goodsReceiptLines.batchNo));
  const bills = await db
    .select({ id: s.supplierBills.id, number: s.supplierBills.number, date: s.supplierBills.date, status: s.supplierBills.status, total: s.supplierBills.total, paymentStatus: s.supplierBills.paymentStatus })
    .from(s.supplierBills)
    .where(
      or(
        eq(s.supplierBills.goodsReceiptId, id),
        sql`${s.supplierBills.id} in (select bl.bill_id from supplier_bill_lines bl join goods_receipt_lines gl on gl.id = bl.goods_receipt_line_id where gl.receipt_id = ${id})`
      )
    )
    .orderBy(asc(s.supplierBills.date));
  return { ...row, lines: lines.map((l) => ({ ...l.line, sku: l.sku, unit: l.unit, trackBatches: l.trackBatches, productName: l.productName })), bills };
}

/** Group a receipt's roll lines back into one editor line per product / PO line / cost. */
export function groupReceiptLines<T extends { productId: string; purchaseOrderLineId: string | null; unitCost: number; qty: number; batchNo: string | null; description: string }>(lines: T[]) {
  const groups: { key: string; first: T; qty: number; rolls: { batchNo: string | null; qty: number }[] }[] = [];
  for (const l of lines) {
    const key = `${l.purchaseOrderLineId ?? ""}|${l.productId}|${l.unitCost}`;
    const g = l.batchNo !== null ? groups.find((x) => x.key === key && x.rolls.length) : undefined;
    if (g) {
      g.qty = round3(g.qty + l.qty);
      g.rolls.push({ batchNo: l.batchNo, qty: l.qty });
    } else {
      groups.push({ key, first: l, qty: l.qty, rolls: l.batchNo !== null ? [{ batchNo: l.batchNo, qty: l.qty }] : [] });
    }
  }
  return groups;
}

/** Prefill a new GRN from a PO: remaining qty at PO cost (after line discounts). */
export async function receiptPrefillFromOrder(orderId: string) {
  const po = await getPurchaseOrder(orderId);
  if (!po) return null;
  const lines = po.lines
    .filter((l) => l.productId && l.isStock && l.qty - l.receivedQty > 0.0005)
    .map((l) => ({
      purchaseOrderLineId: l.id,
      productId: l.productId!,
      description: l.description,
      qty: round3(l.qty - l.receivedQty),
      // Receipt value at the net PO cost (discounts applied, tax excluded)
      unitCost: l.qty ? round2((l.lineTotal - l.taxAmount) / l.qty) : l.unitCost,
      ordered: l.qty,
      received: l.receivedQty,
    }));
  return { po: po.po, supplier: po.supplier, lines };
}

// ---- Bills ----------------------------------------------------------------------------------

export type BillRow = Awaited<ReturnType<typeof listBills>>[number];

export async function listBills(opts: { supplierId?: string } = {}) {
  const rows = await db
    .select({
      id: s.supplierBills.id,
      number: s.supplierBills.number,
      supplierInvoiceNo: s.supplierBills.supplierInvoiceNo,
      date: s.supplierBills.date,
      dueDate: s.supplierBills.dueDate,
      status: s.supplierBills.status,
      paymentStatus: s.supplierBills.paymentStatus,
      total: s.supplierBills.total,
      amountPaid: s.supplierBills.amountPaid,
      supplierId: s.supplierBills.supplierId,
      supplierName: s.suppliers.name,
    })
    .from(s.supplierBills)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.supplierBills.supplierId))
    .where(opts.supplierId ? eq(s.supplierBills.supplierId, opts.supplierId) : undefined)
    .orderBy(desc(s.supplierBills.date), desc(s.supplierBills.number));
  const t = today();
  return rows.map((r) => ({
    ...r,
    outstanding: r.status === "posted" ? round2(r.total - r.amountPaid) : 0,
    overdue: r.status === "posted" && r.paymentStatus !== "paid" && !!r.dueDate && r.dueDate < t,
  }));
}

export async function getBill(id: string) {
  const [row] = await db
    .select({
      bill: s.supplierBills,
      supplier: s.suppliers,
      warehouseName: s.warehouses.name,
      poNumber: s.purchaseOrders.number,
      grnNumber: s.goodsReceipts.number,
    })
    .from(s.supplierBills)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.supplierBills.supplierId))
    .leftJoin(s.warehouses, eq(s.warehouses.id, s.supplierBills.warehouseId))
    .leftJoin(s.purchaseOrders, eq(s.purchaseOrders.id, s.supplierBills.purchaseOrderId))
    .leftJoin(s.goodsReceipts, eq(s.goodsReceipts.id, s.supplierBills.goodsReceiptId))
    .where(eq(s.supplierBills.id, id));
  if (!row) return null;
  const lines = await db
    .select({
      line: s.supplierBillLines,
      sku: s.products.sku,
      unit: s.units.code,
      productType: s.products.type,
      trackBatches: s.products.trackBatches,
      accountName: s.accounts.name,
      accountCode: s.accounts.code,
      grnNumber: s.goodsReceipts.number,
      grnId: s.goodsReceipts.id,
    })
    .from(s.supplierBillLines)
    .leftJoin(s.products, eq(s.products.id, s.supplierBillLines.productId))
    .leftJoin(s.units, eq(s.units.id, s.products.unitId))
    .leftJoin(s.accounts, eq(s.accounts.id, s.supplierBillLines.expenseAccountId))
    .leftJoin(s.goodsReceiptLines, eq(s.goodsReceiptLines.id, s.supplierBillLines.goodsReceiptLineId))
    .leftJoin(s.goodsReceipts, eq(s.goodsReceipts.id, s.goodsReceiptLines.receiptId))
    .where(eq(s.supplierBillLines.billId, id))
    .orderBy(asc(s.supplierBillLines.lineNo));
  const [allocations, returns, returned] = await Promise.all([
    db
      .select({ id: s.supplierPayments.id, number: s.supplierPayments.number, date: s.supplierPayments.date, status: s.supplierPayments.status, amount: s.paymentAllocations.amount, method: s.supplierPayments.method })
      .from(s.paymentAllocations)
      .innerJoin(s.supplierPayments, eq(s.supplierPayments.id, s.paymentAllocations.paymentId))
      .where(eq(s.paymentAllocations.billId, id))
      .orderBy(asc(s.supplierPayments.date)),
    db
      .select({ id: s.purchaseReturns.id, number: s.purchaseReturns.number, date: s.purchaseReturns.date, status: s.purchaseReturns.status, total: s.purchaseReturns.total })
      .from(s.purchaseReturns)
      .where(eq(s.purchaseReturns.billId, id))
      .orderBy(asc(s.purchaseReturns.date)),
    returnedQtyByBillLine(db, id),
  ]);
  // GRNs this bill draws from (one bill can cover lines of several receipts)
  const grns = new Map<string, string>();
  for (const l of lines) if (l.grnId && l.grnNumber) grns.set(l.grnId, l.grnNumber);
  if (row.bill.goodsReceiptId && row.grnNumber) grns.set(row.bill.goodsReceiptId, row.grnNumber);
  return {
    ...row,
    lines: lines.map((l) => ({
      ...l.line,
      sku: l.sku,
      unit: l.unit,
      productType: l.productType,
      trackBatches: l.trackBatches,
      accountName: l.accountName ? `${l.accountCode} · ${l.accountName}` : null,
      grnNumber: l.grnNumber,
      returnedQty: returned.get(l.line.id) ?? 0,
    })),
    allocations,
    returns,
    receipts: [...grns].map(([gid, number]) => ({ id: gid, number })),
  };
}

/** Prefill a bill from a posted GRN: each roll group's unbilled qty at the receipt cost. */
export async function billPrefillFromReceipt(receiptId: string) {
  const grn = await getReceipt(receiptId);
  if (!grn || grn.grn.status !== "posted") return null;
  const poLineIds = grn.lines.map((l) => l.purchaseOrderLineId).filter((x): x is string => !!x);
  const poLines = poLineIds.length ? await db.select().from(s.purchaseOrderLines).where(inArray(s.purchaseOrderLines.id, poLineIds)) : [];
  const taxRates = await productTaxRates(grn.lines.map((l) => l.productId));
  const groups = new Map<string, { id: string; productId: string; description: string; qty: number; unitCost: number; taxRate: number }>();
  for (const l of grn.lines) {
    const key = `${l.purchaseOrderLineId ?? ""}|${l.productId}|${l.unitCost}`;
    const open = round3(l.qty - l.billedQty);
    const g = groups.get(key);
    if (g) g.qty = round3(g.qty + open);
    else {
      const pl = poLines.find((p) => p.id === l.purchaseOrderLineId);
      groups.set(key, { id: l.id, productId: l.productId, description: l.description, qty: open, unitCost: l.unitCost, taxRate: pl?.taxRate ?? taxRates.get(l.productId) ?? 0 });
    }
  }
  const lines = [...groups.values()].filter((g) => g.qty > 0.0005);
  return { grn: grn.grn, supplier: grn.supplier, lines };
}

/**
 * Prefill a bill from a PO: what is neither billed nor already received on a GRN (those are billed
 * from their receipt), at PO price, received with the bill.
 */
export async function billPrefillFromOrder(orderId: string) {
  const po = await getPurchaseOrder(orderId);
  if (!po) return null;
  const lines = po.lines
    .map((l) => ({ l, open: round3(l.qty - Math.max(l.billedQty, l.isStock ? l.receivedQty : 0)) }))
    .filter(({ open }) => open > 0.0005)
    .map(({ l, open }) => ({
      purchaseOrderLineId: l.id,
      productId: l.productId,
      description: l.description,
      qty: open,
      price: l.unitCost,
      discountPct: l.discountPct,
      taxRate: l.taxRate,
    }));
  const unbilledGrns = po.receipts.filter((r) => r.status === "posted" && r.billStatus !== "billed");
  return { po: po.po, supplier: po.supplier, lines, unbilledGrns };
}

async function productTaxRates(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({ id: s.products.id, rate: s.taxRates.rate })
    .from(s.products)
    .leftJoin(s.taxRates, eq(s.taxRates.id, s.products.taxRateId))
    .where(inArray(s.products.id, ids));
  return new Map(rows.map((r) => [r.id, r.rate ?? 0]));
}

/** Posted receipts of a supplier that still have something to bill (for the bill form picker). */
export async function unbilledReceipts(supplierId?: string) {
  return db
    .select({ id: s.goodsReceipts.id, number: s.goodsReceipts.number, date: s.goodsReceipts.date, supplierId: s.goodsReceipts.supplierId, supplierName: s.suppliers.name })
    .from(s.goodsReceipts)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.goodsReceipts.supplierId))
    .where(and(eq(s.goodsReceipts.status, "posted"), ne(s.goodsReceipts.billStatus, "billed"), supplierId ? eq(s.goodsReceipts.supplierId, supplierId) : undefined))
    .orderBy(desc(s.goodsReceipts.date));
}

/** Purchase orders goods can still be received against. */
export async function receivableOrders() {
  return db
    .select({ id: s.purchaseOrders.id, number: s.purchaseOrders.number, date: s.purchaseOrders.date, supplierName: s.suppliers.name })
    .from(s.purchaseOrders)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.purchaseOrders.supplierId))
    .where(inArray(s.purchaseOrders.status, ["approved", "sent", "partial"]))
    .orderBy(desc(s.purchaseOrders.date));
}

// ---- Payments -------------------------------------------------------------------------------

export type PaymentRow = Awaited<ReturnType<typeof listPayments>>[number];

export async function listPayments(opts: { supplierId?: string } = {}) {
  return db
    .select({
      id: s.supplierPayments.id,
      number: s.supplierPayments.number,
      date: s.supplierPayments.date,
      method: s.supplierPayments.method,
      amount: s.supplierPayments.amount,
      reference: s.supplierPayments.reference,
      status: s.supplierPayments.status,
      supplierId: s.supplierPayments.supplierId,
      supplierName: s.suppliers.name,
      accountName: s.accounts.name,
      allocated: sql<number>`coalesce((select sum(amount) from payment_allocations a where a.payment_id = supplier_payments.id), 0)`.mapWith(Number),
    })
    .from(s.supplierPayments)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.supplierPayments.supplierId))
    .leftJoin(s.accounts, eq(s.accounts.id, s.supplierPayments.paidFromAccountId))
    .where(opts.supplierId ? eq(s.supplierPayments.supplierId, opts.supplierId) : undefined)
    .orderBy(desc(s.supplierPayments.date), desc(s.supplierPayments.number));
}

export async function getPayment(id: string) {
  const [row] = await db
    .select({ payment: s.supplierPayments, supplier: s.suppliers, accountName: s.accounts.name, accountCode: s.accounts.code })
    .from(s.supplierPayments)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.supplierPayments.supplierId))
    .leftJoin(s.accounts, eq(s.accounts.id, s.supplierPayments.paidFromAccountId))
    .where(eq(s.supplierPayments.id, id));
  if (!row) return null;
  const allocations = await db
    .select({
      billId: s.supplierBills.id,
      number: s.supplierBills.number,
      supplierInvoiceNo: s.supplierBills.supplierInvoiceNo,
      date: s.supplierBills.date,
      dueDate: s.supplierBills.dueDate,
      total: s.supplierBills.total,
      amount: s.paymentAllocations.amount,
    })
    .from(s.paymentAllocations)
    .innerJoin(s.supplierBills, eq(s.supplierBills.id, s.paymentAllocations.billId))
    .where(eq(s.paymentAllocations.paymentId, id))
    .orderBy(asc(s.supplierBills.date));
  return { ...row, allocations };
}

/** Posted bills with something still to pay, for the payment allocation grid. */
export async function openBills(supplierId?: string) {
  const rows = await db
    .select({
      id: s.supplierBills.id,
      number: s.supplierBills.number,
      supplierInvoiceNo: s.supplierBills.supplierInvoiceNo,
      supplierId: s.supplierBills.supplierId,
      date: s.supplierBills.date,
      dueDate: s.supplierBills.dueDate,
      total: s.supplierBills.total,
      amountPaid: s.supplierBills.amountPaid,
    })
    .from(s.supplierBills)
    .where(and(eq(s.supplierBills.status, "posted"), ne(s.supplierBills.paymentStatus, "paid"), supplierId ? eq(s.supplierBills.supplierId, supplierId) : undefined))
    .orderBy(asc(s.supplierBills.dueDate), asc(s.supplierBills.date));
  return rows.map((r) => ({ ...r, outstanding: round2(r.total - r.amountPaid) })).filter((r) => r.outstanding > 0);
}

// ---- Returns --------------------------------------------------------------------------------

export type ReturnRow = Awaited<ReturnType<typeof listReturns>>[number];

export async function listReturns(opts: { supplierId?: string } = {}) {
  return db
    .select({
      id: s.purchaseReturns.id,
      number: s.purchaseReturns.number,
      date: s.purchaseReturns.date,
      status: s.purchaseReturns.status,
      total: s.purchaseReturns.total,
      reason: s.purchaseReturns.reason,
      supplierId: s.purchaseReturns.supplierId,
      supplierName: s.suppliers.name,
      billNumber: s.supplierBills.number,
      billId: s.purchaseReturns.billId,
    })
    .from(s.purchaseReturns)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.purchaseReturns.supplierId))
    .leftJoin(s.supplierBills, eq(s.supplierBills.id, s.purchaseReturns.billId))
    .where(opts.supplierId ? eq(s.purchaseReturns.supplierId, opts.supplierId) : undefined)
    .orderBy(desc(s.purchaseReturns.date), desc(s.purchaseReturns.number));
}

export async function getReturn(id: string) {
  const [row] = await db
    .select({ ret: s.purchaseReturns, supplier: s.suppliers, warehouseName: s.warehouses.name, billNumber: s.supplierBills.number, supplierInvoiceNo: s.supplierBills.supplierInvoiceNo })
    .from(s.purchaseReturns)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.purchaseReturns.supplierId))
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.purchaseReturns.warehouseId))
    .leftJoin(s.supplierBills, eq(s.supplierBills.id, s.purchaseReturns.billId))
    .where(eq(s.purchaseReturns.id, id));
  if (!row) return null;
  const lines = await db
    .select({ line: s.purchaseReturnLines, sku: s.products.sku, unit: s.units.code, batchNo: s.batches.batchNo })
    .from(s.purchaseReturnLines)
    .leftJoin(s.products, eq(s.products.id, s.purchaseReturnLines.productId))
    .leftJoin(s.units, eq(s.units.id, s.products.unitId))
    .leftJoin(s.batches, eq(s.batches.id, s.purchaseReturnLines.batchId))
    .where(eq(s.purchaseReturnLines.returnId, id))
    .orderBy(asc(s.purchaseReturnLines.lineNo));
  return { ...row, lines: lines.map((l) => ({ ...l.line, sku: l.sku, unit: l.unit, batchNo: l.batchNo })) };
}

/** Bill lines that can still be returned, with the rolls available for batch products. */
export async function returnPrefillFromBill(billId: string, exceptReturnId?: string) {
  const bill = await getBill(billId);
  if (!bill || bill.bill.status !== "posted") return null;
  const returned = await returnedQtyByBillLine(db, billId, exceptReturnId);
  const warehouseId = bill.bill.warehouseId;
  const productIds = bill.lines.filter((l) => l.productId && l.trackBatches).map((l) => l.productId!);
  const rolls = productIds.length
    ? await db
        .select({ id: s.batches.id, productId: s.batches.productId, batchNo: s.batches.batchNo, qty: s.batches.qty, warehouseId: s.batches.warehouseId })
        .from(s.batches)
        .where(and(inArray(s.batches.productId, productIds), gt(s.batches.qty, 0), warehouseId ? eq(s.batches.warehouseId, warehouseId) : undefined))
        .orderBy(asc(s.batches.batchNo))
    : [];
  const lines = bill.lines.map((l) => ({
    billLineId: l.id,
    productId: l.productId,
    description: l.description,
    sku: l.sku,
    unit: l.unit,
    billedQty: l.qty,
    returnedQty: returned.get(l.id) ?? 0,
    returnable: Math.max(round3(l.qty - (returned.get(l.id) ?? 0)), 0),
    unitCost: l.qty ? round2((l.lineTotal - l.taxAmount) / l.qty) : 0,
    taxRate: l.taxRate,
    taxPerUnit: l.qty ? l.taxAmount / l.qty : 0,
    trackBatches: !!l.trackBatches,
    isStock: l.productType === "stock",
    rolls: rolls.filter((r) => r.productId === l.productId).map((r) => ({ id: r.id, batchNo: r.batchNo, qty: r.qty })),
  }));
  return { bill: bill.bill, supplier: bill.supplier, lines };
}

/** Posted bills that can be returned against (for the "new return" picker). */
export async function returnableBills() {
  return db
    .select({ id: s.supplierBills.id, number: s.supplierBills.number, date: s.supplierBills.date, supplierName: s.suppliers.name, total: s.supplierBills.total })
    .from(s.supplierBills)
    .innerJoin(s.suppliers, eq(s.suppliers.id, s.supplierBills.supplierId))
    .where(eq(s.supplierBills.status, "posted"))
    .orderBy(desc(s.supplierBills.date))
    .limit(500);
}
