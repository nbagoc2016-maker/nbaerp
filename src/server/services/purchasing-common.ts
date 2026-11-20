// Helpers shared by the purchasing services (orders, receipts, bills, payments, returns).
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  batches,
  goodsReceiptLines,
  goodsReceipts,
  paymentAllocations,
  products,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReturns,
  supplierBills,
  supplierPayments,
  suppliers,
  warehouses,
} from "@/db/schema";
import { calcDocument } from "@/lib/doc-calc";
import { round2, round3 } from "@/lib/format";
import { AppError } from "../errors";

export const QTY_EPS = 0.0005;
export const MONEY_EPS = 0.005;

export type ProductRow = typeof products.$inferSelect;

export async function getSupplierOrThrow(db: DbOrTx, id: string) {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!row) throw new AppError("Supplier not found", { supplierId: "Choose a supplier" });
  return row;
}

export async function getWarehouseOrThrow(db: DbOrTx, id: string) {
  const [row] = await db.select().from(warehouses).where(eq(warehouses.id, id));
  if (!row) throw new AppError("Warehouse not found", { warehouseId: "Choose a warehouse" });
  return row;
}

export async function defaultWarehouse(db: DbOrTx) {
  const [w] = await db.select().from(warehouses).where(eq(warehouses.isDefault, true)).limit(1);
  return w ?? (await db.select().from(warehouses).limit(1))[0] ?? null;
}

export async function loadProducts(db: DbOrTx, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = unique.length ? await db.select().from(products).where(inArray(products.id, unique)) : [];
  const map = new Map(rows.map((p) => [p.id, p]));
  for (const id of unique) if (!map.has(id)) throw new AppError("A product on this document no longer exists");
  return map;
}

/** Recompute document lines and totals on the server (client totals are never trusted). */
export function computeDocLines(
  lines: { qty: number; price: number; discountPct: number; taxRate: number }[],
  opts: { documentDiscount: number; charges: number }
) {
  const calc = calcDocument(lines, opts);
  return {
    calc,
    lineValues: calc.lines.map((l) => ({
      qty: round3(l.qty),
      unitCost: round2(l.price),
      discountPct: l.discountPct,
      discountAmount: round2(l.gross - l.net), // line discount plus its share of the bill discount
      taxRate: l.taxRate,
      taxAmount: l.taxAmount,
      lineTotal: l.lineTotal,
    })),
    totals: {
      subtotal: calc.subtotal,
      discountTotal: calc.discountTotal,
      documentDiscount: calc.documentDiscount,
      taxTotal: calc.taxTotal,
      freightCharges: calc.charges,
      total: calc.total,
    },
  };
}

/** PO status follows what has been received: partial / received (draft, closed and cancelled stay put). */
export async function refreshPurchaseOrderStatus(db: DbOrTx, orderId: string | null | undefined) {
  if (!orderId) return;
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId));
  if (!po || po.status === "draft" || po.status === "closed" || po.status === "cancelled") return;
  // Only stock items are received; service lines don't hold the order open
  const lines = (
    await db
      .select({ qty: purchaseOrderLines.qty, receivedQty: purchaseOrderLines.receivedQty })
      .from(purchaseOrderLines)
      .innerJoin(products, eq(products.id, purchaseOrderLines.productId))
      .where(and(eq(purchaseOrderLines.orderId, orderId), eq(products.type, "stock")))
  );
  if (!lines.length) return;
  const all = lines.every((l) => l.receivedQty >= l.qty - QTY_EPS);
  const any = lines.some((l) => l.receivedQty > QTY_EPS);
  const status = all ? "received" : any ? "partial" : po.status === "partial" || po.status === "received" ? "approved" : po.status;
  if (status !== po.status) await db.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, orderId));
}

export async function bumpPurchaseOrderLine(db: DbOrTx, lineId: string | null | undefined, field: "receivedQty" | "billedQty", delta: number) {
  if (!lineId || !delta) return null;
  const bump = (col: typeof purchaseOrderLines.receivedQty) => sql`greatest(round(${col} + ${round3(delta)}::numeric, 3), 0)`;
  const [row] = await db
    .update(purchaseOrderLines)
    .set(field === "receivedQty" ? { receivedQty: bump(purchaseOrderLines.receivedQty) } : { billedQty: bump(purchaseOrderLines.billedQty) })
    .where(eq(purchaseOrderLines.id, lineId))
    .returning({ orderId: purchaseOrderLines.orderId });
  return row?.orderId ?? null;
}

/** GRN bill status from its lines' billed qty. */
export async function refreshReceiptBillStatus(db: DbOrTx, receiptId: string) {
  const lines = await db.select().from(goodsReceiptLines).where(eq(goodsReceiptLines.receiptId, receiptId));
  const all = lines.length > 0 && lines.every((l) => l.billedQty >= l.qty - QTY_EPS);
  const any = lines.some((l) => l.billedQty > QTY_EPS);
  await db
    .update(goodsReceipts)
    .set({ billStatus: all ? "billed" : any ? "partial" : "unbilled" })
    .where(eq(goodsReceipts.id, receiptId));
}

/**
 * Bill settlement from posted payment allocations plus posted purchase returns against it.
 * amount_paid is capped at the bill total; anything beyond stays on the supplier's account.
 */
export async function refreshBillPayment(db: DbOrTx, billId: string) {
  const [bill] = await db.select().from(supplierBills).where(eq(supplierBills.id, billId));
  if (!bill) return;
  const [alloc] = await db
    .select({ s: sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)`.mapWith(Number) })
    .from(paymentAllocations)
    .innerJoin(supplierPayments, eq(supplierPayments.id, paymentAllocations.paymentId))
    .where(and(eq(paymentAllocations.billId, billId), eq(supplierPayments.status, "posted")));
  const [ret] = await db
    .select({ s: sql<number>`coalesce(sum(${purchaseReturns.total}), 0)`.mapWith(Number) })
    .from(purchaseReturns)
    .where(and(eq(purchaseReturns.billId, billId), eq(purchaseReturns.status, "posted")));
  const settled = round2(alloc.s + ret.s);
  const amountPaid = round2(Math.min(settled, bill.total));
  const paymentStatus = bill.total <= 0 || settled >= bill.total - MONEY_EPS ? "paid" : settled > MONEY_EPS ? "partial" : "unpaid";
  await db.update(supplierBills).set({ amountPaid, paymentStatus }).where(eq(supplierBills.id, billId));
  return { amountPaid, paymentStatus, outstanding: round2(bill.total - amountPaid) };
}

/** Unpaid amount still open on a bill (refreshes its payment status on the way). */
export async function billOutstanding(db: DbOrTx, billId: string) {
  const res = await refreshBillPayment(db, billId);
  return res?.outstanding ?? 0;
}

/** Roll / lot numbers are unique per product. */
export async function assertNewBatchNo(db: DbOrTx, product: ProductRow, batchNo: string) {
  const [exists] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.productId, product.id), eq(batches.batchNo, batchNo)))
    .limit(1);
  if (exists) throw new AppError(`Roll ${batchNo} of "${product.name}" already exists. Use a different roll number.`);
}
