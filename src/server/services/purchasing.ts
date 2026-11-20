// Purchase orders and goods receipts (GRN).
import { and, eq, inArray, ne } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { batches, goodsReceiptLines, goodsReceipts, purchaseOrderLines, purchaseOrders, supplierBills } from "@/db/schema";
import { round2, round3, today } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { nextNumber } from "./numbering";
import {
  bumpPurchaseOrderLine,
  computeDocLines,
  getSupplierOrThrow,
  getWarehouseOrThrow,
  loadProducts,
  QTY_EPS,
  refreshPurchaseOrderStatus,
} from "./purchasing-common";
import { goodsReceiptSchema, purchaseOrderSchema, type GoodsReceiptInput, type PurchaseOrderInput } from "./purchasing-schemas";
import { createBatch, moveStock, reverseStockForSource } from "./stock";

// ---- Purchase orders ------------------------------------------------------------------------

export async function getPurchaseOrderOrThrow(db: DbOrTx, id: string) {
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!po) throw new AppError("Purchase order not found");
  return po;
}

/** Create or update a draft purchase order. */
export async function savePurchaseOrder(db: DbOrTx, actor: Actor | null, raw: PurchaseOrderInput) {
  const input = purchaseOrderSchema.parse(raw);
  await getSupplierOrThrow(db, input.supplierId);
  await getWarehouseOrThrow(db, input.warehouseId);
  await loadProducts(db, input.lines.map((l) => l.productId));
  if (input.expectedDate && input.expectedDate < input.date) {
    throw new AppError("Expected date can't be before the order date", { expectedDate: "Before the order date" });
  }

  const { lineValues, totals } = computeDocLines(input.lines, input);
  const header = {
    date: input.date,
    expectedDate: input.expectedDate ?? null,
    supplierId: input.supplierId,
    warehouseId: input.warehouseId,
    terms: input.terms,
    notes: input.notes,
    ...totals,
  };

  let id: string;
  let number: string;
  if (input.id) {
    const po = await getPurchaseOrderOrThrow(db, input.id);
    if (po.status !== "draft") throw new AppError("Only draft purchase orders can be edited");
    await db.update(purchaseOrders).set(header).where(eq(purchaseOrders.id, po.id));
    await db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, po.id));
    id = po.id;
    number = po.number;
  } else {
    number = await nextNumber(db, "PO");
    const [po] = await db
      .insert(purchaseOrders)
      .values({ ...header, number, status: "draft", createdBy: actor?.id ?? null })
      .returning();
    id = po.id;
  }

  await db.insert(purchaseOrderLines).values(
    input.lines.map((l, i) => ({
      orderId: id,
      lineNo: i + 1,
      productId: l.productId,
      description: l.description,
      ...lineValues[i],
    }))
  );

  await logAudit(db, actor, {
    action: input.id ? "update" : "create",
    entity: "purchase_order",
    entityId: id,
    summary: `${input.id ? "Updated" : "Created"} purchase order ${number} (${totals.total})`,
  });
  return { id, number };
}

async function setPoStatus(
  db: DbOrTx,
  actor: Actor | null,
  id: string,
  from: string[],
  to: "approved" | "sent" | "closed" | "cancelled",
  verb: string
) {
  const po = await getPurchaseOrderOrThrow(db, id);
  if (!from.includes(po.status)) throw new AppError(`A ${po.status} purchase order can't be ${verb}`);
  await db
    .update(purchaseOrders)
    .set({ status: to, ...(to === "approved" ? { approvedBy: actor?.id ?? null } : {}) })
    .where(eq(purchaseOrders.id, id));
  await logAudit(db, actor, { action: to === "approved" ? "approve" : to, entity: "purchase_order", entityId: id, summary: `Purchase order ${po.number} ${verb}` });
  return { id };
}

export const approvePurchaseOrder = (db: DbOrTx, actor: Actor | null, input: { id: string }) =>
  setPoStatus(db, actor, input.id, ["draft"], "approved", "approved");

export const markPurchaseOrderSent = (db: DbOrTx, actor: Actor | null, input: { id: string }) =>
  setPoStatus(db, actor, input.id, ["approved"], "sent", "marked as sent");

/** Short-close an order: whatever hasn't arrived is no longer expected. */
export const closePurchaseOrder = (db: DbOrTx, actor: Actor | null, input: { id: string }) =>
  setPoStatus(db, actor, input.id, ["approved", "sent", "partial", "received"], "closed", "closed");

export async function cancelPurchaseOrder(db: DbOrTx, actor: Actor | null, input: { id: string }) {
  const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, input.id));
  if (lines.some((l) => l.receivedQty > QTY_EPS || l.billedQty > QTY_EPS)) {
    throw new AppError("Goods have already been received or billed on this order. Close it instead of cancelling.");
  }
  return setPoStatus(db, actor, input.id, ["draft", "approved", "sent"], "cancelled", "cancelled");
}

export async function deletePurchaseOrder(db: DbOrTx, actor: Actor | null, input: { id: string }) {
  const po = await getPurchaseOrderOrThrow(db, input.id);
  if (po.status !== "draft") throw new AppError("Only draft purchase orders can be deleted");
  const [grn] = await db.select({ id: goodsReceipts.id }).from(goodsReceipts).where(eq(goodsReceipts.purchaseOrderId, po.id)).limit(1);
  const [bill] = await db.select({ id: supplierBills.id }).from(supplierBills).where(eq(supplierBills.purchaseOrderId, po.id)).limit(1);
  if (grn || bill) throw new AppError("This order has receipts or bills linked to it. Cancel it instead.");
  await db.delete(purchaseOrders).where(eq(purchaseOrders.id, po.id));
  await logAudit(db, actor, { action: "delete", entity: "purchase_order", entityId: po.id, summary: `Deleted draft purchase order ${po.number}` });
  return { id: po.id };
}

// ---- Goods receipts -------------------------------------------------------------------------

export async function getReceiptOrThrow(db: DbOrTx, id: string) {
  const [grn] = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, id));
  if (!grn) throw new AppError("Goods receipt not found");
  return grn;
}

const RECEIVABLE_PO = ["approved", "sent", "partial"];

/** Create or update a draft goods receipt. Rolls are stored as one receipt line each. */
export async function saveGoodsReceipt(db: DbOrTx, actor: Actor | null, raw: GoodsReceiptInput) {
  const input = goodsReceiptSchema.parse(raw);
  await getSupplierOrThrow(db, input.supplierId);
  await getWarehouseOrThrow(db, input.warehouseId);
  const productMap = await loadProducts(db, input.lines.map((l) => l.productId));

  let poLineIds = new Set<string>();
  if (input.purchaseOrderId) {
    const po = await getPurchaseOrderOrThrow(db, input.purchaseOrderId);
    if (po.supplierId !== input.supplierId) throw new AppError(`Purchase order ${po.number} belongs to another supplier`);
    if (!RECEIVABLE_PO.includes(po.status)) throw new AppError(`Purchase order ${po.number} is ${po.status}; goods can't be received against it`);
    const poLines = await db.select({ id: purchaseOrderLines.id }).from(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, po.id));
    poLineIds = new Set(poLines.map((l) => l.id));
  }

  const rows: Omit<typeof goodsReceiptLines.$inferInsert, "receiptId">[] = [];
  input.lines.forEach((l, i) => {
    const p = productMap.get(l.productId)!;
    if (p.type !== "stock") throw new AppError(`Line ${i + 1}: "${p.name}" is a service and can't be received into stock`);
    const poLineId = l.purchaseOrderLineId && poLineIds.has(l.purchaseOrderLineId) ? l.purchaseOrderLineId : null;
    if (l.purchaseOrderLineId && !poLineId) throw new AppError(`Line ${i + 1} doesn't belong to the selected purchase order`);
    // Roll rows keep a batch_no ("" until numbered on posting); plain lines have none
    const rolls = l.rolls.filter((r) => r.qty > 0);
    if (rolls.length) {
      if (!p.trackBatches) throw new AppError(`Line ${i + 1}: "${p.name}" doesn't track rolls / batches`);
      const sum = round3(rolls.reduce((s, r) => s + r.qty, 0));
      if (Math.abs(sum - l.qty) > QTY_EPS) {
        throw new AppError(`Line ${i + 1}: rolls add up to ${sum} but the line quantity is ${l.qty}`);
      }
      const nos = rolls.map((r) => r.batchNo?.trim()).filter(Boolean);
      if (new Set(nos).size !== nos.length) throw new AppError(`Line ${i + 1}: the same roll number is entered twice`);
      for (const r of rolls) {
        rows.push({ purchaseOrderLineId: poLineId, productId: p.id, description: l.description, qty: round3(r.qty), unitCost: round2(l.unitCost), batchNo: r.batchNo?.trim() ?? "" });
      }
    } else {
      rows.push({ purchaseOrderLineId: poLineId, productId: p.id, description: l.description, qty: round3(l.qty), unitCost: round2(l.unitCost), batchNo: null });
    }
  });
  const totalValue = round2(rows.reduce((s, r) => s + round2(Number(r.qty) * Number(r.unitCost)), 0));

  const header = {
    date: input.date,
    supplierId: input.supplierId,
    warehouseId: input.warehouseId,
    purchaseOrderId: input.purchaseOrderId,
    supplierDeliveryRef: input.supplierDeliveryRef,
    notes: input.notes,
    totalValue,
  };

  let id: string;
  let number: string;
  if (input.id) {
    const grn = await getReceiptOrThrow(db, input.id);
    if (grn.status !== "draft") throw new AppError("Only draft goods receipts can be edited");
    await db.update(goodsReceipts).set(header).where(eq(goodsReceipts.id, grn.id));
    await db.delete(goodsReceiptLines).where(eq(goodsReceiptLines.receiptId, grn.id));
    id = grn.id;
    number = grn.number;
  } else {
    number = await nextNumber(db, "GRN");
    const [grn] = await db.insert(goodsReceipts).values({ ...header, number, createdBy: actor?.id ?? null }).returning();
    id = grn.id;
  }
  await db.insert(goodsReceiptLines).values(rows.map((r) => ({ ...r, receiptId: id })));

  await logAudit(db, actor, {
    action: input.id ? "update" : "create",
    entity: "goods_receipt",
    entityId: id,
    summary: `${input.id ? "Updated" : "Created"} goods receipt ${number} (${totalValue})`,
  });
  return { id, number };
}

/** Post a GRN: stock in (creating rolls), Dr Inventory / Cr GRNI, and update the PO. */
export async function postGoodsReceipt(db: DbOrTx, actor: Actor | null, input: { id: string }) {
  const grn = await getReceiptOrThrow(db, input.id);
  if (grn.status !== "draft") throw new AppError(`Goods receipt ${grn.number} is already ${grn.status}`);
  if (grn.purchaseOrderId) {
    const po = await getPurchaseOrderOrThrow(db, grn.purchaseOrderId);
    if (!RECEIVABLE_PO.includes(po.status)) throw new AppError(`Purchase order ${po.number} is ${po.status}; goods can't be received against it`);
  }
  const lines = await db.select().from(goodsReceiptLines).where(eq(goodsReceiptLines.receiptId, grn.id));
  if (!lines.length) throw new AppError("This goods receipt has no lines");
  const productMap = await loadProducts(db, lines.map((l) => l.productId));

  // Roll numbers must be unique per product; blanks get one from the GRN number
  let seq = 0;
  const used = new Set<string>();
  for (const l of lines) {
    const p = productMap.get(l.productId)!;
    if (!p.trackBatches) continue;
    const batchNo = l.batchNo?.trim() || `${grn.number}-${++seq}`;
    const key = `${p.id}|${batchNo.toLowerCase()}`;
    if (used.has(key)) throw new AppError(`Roll ${batchNo} of "${p.name}" is entered twice`);
    used.add(key);
    const [exists] = await db
      .select({ id: batches.id })
      .from(batches)
      .where(and(eq(batches.productId, p.id), eq(batches.batchNo, batchNo)))
      .limit(1);
    if (exists) throw new AppError(`Roll ${batchNo} of "${p.name}" already exists. Use a different roll number.`);
    l.batchNo = batchNo;
  }

  let total = 0;
  const touchedOrders = new Set<string>();
  for (const l of lines) {
    const p = productMap.get(l.productId)!;
    let batchId: string | null = null;
    if (p.trackBatches) {
      const batch = await createBatch(db, {
        productId: p.id,
        warehouseId: grn.warehouseId,
        batchNo: l.batchNo!,
        qty: l.qty,
        unitCost: l.unitCost,
        receivedDate: grn.date,
      });
      batchId = batch.id;
    }
    await moveStock(db, actor, {
      date: grn.date,
      productId: p.id,
      warehouseId: grn.warehouseId,
      qty: l.qty,
      unitCost: l.unitCost,
      batchId,
      sourceType: "goods_receipt",
      sourceId: grn.id,
      sourceNumber: grn.number,
    });
    await db.update(goodsReceiptLines).set({ batchId, batchNo: l.batchNo }).where(eq(goodsReceiptLines.id, l.id));
    total = round2(total + round2(l.qty * l.unitCost));
    const orderId = await bumpPurchaseOrderLine(db, l.purchaseOrderLineId, "receivedQty", l.qty);
    if (orderId) touchedOrders.add(orderId);
  }

  let journalEntryId: string | null = null;
  if (total > 0) {
    const je = await postJournal(db, actor, {
      date: grn.date,
      memo: `Goods received ${grn.number}`,
      sourceType: "goods_receipt",
      sourceId: grn.id,
      sourceNumber: grn.number,
      lines: [
        { account: ACC.INVENTORY, debit: total },
        // GRNI is not tagged with the supplier: party lines are reserved for the payable
        { account: ACC.GRNI, credit: total },
      ],
    });
    journalEntryId = je.id;
  }
  await db.update(goodsReceipts).set({ status: "posted", totalValue: total, journalEntryId, billStatus: "unbilled" }).where(eq(goodsReceipts.id, grn.id));
  for (const o of touchedOrders) await refreshPurchaseOrderStatus(db, o);

  await logAudit(db, actor, { action: "post", entity: "goods_receipt", entityId: grn.id, summary: `Posted goods receipt ${grn.number} (${total})` });
  return { id: grn.id, number: grn.number, total };
}

/** Void a posted GRN that hasn't been billed: stock out again, journal voided, PO qty restored. */
export async function voidGoodsReceipt(db: DbOrTx, actor: Actor | null, input: { id: string; reason?: string | null }) {
  const grn = await getReceiptOrThrow(db, input.id);
  if (grn.status !== "posted") throw new AppError(`Only posted goods receipts can be voided (this one is ${grn.status})`);
  const lines = await db.select().from(goodsReceiptLines).where(eq(goodsReceiptLines.receiptId, grn.id));
  if (lines.some((l) => l.billedQty > QTY_EPS)) {
    throw new AppError("This receipt has been billed. Void the supplier bill first.");
  }
  await reverseStockForSource(db, actor, "goods_receipt", grn.id, today());
  await voidJournal(db, actor, grn.journalEntryId, input.reason ?? `Goods receipt ${grn.number} voided`);
  const touched = new Set<string>();
  for (const l of lines) {
    const orderId = await bumpPurchaseOrderLine(db, l.purchaseOrderLineId, "receivedQty", -l.qty);
    if (orderId) touched.add(orderId);
  }
  await db.update(goodsReceipts).set({ status: "void" }).where(eq(goodsReceipts.id, grn.id));
  for (const o of touched) await refreshPurchaseOrderStatus(db, o);
  await logAudit(db, actor, {
    action: "void",
    entity: "goods_receipt",
    entityId: grn.id,
    summary: `Voided goods receipt ${grn.number}${input.reason ? `: ${input.reason}` : ""}`,
  });
  return { id: grn.id };
}

export async function deleteGoodsReceipt(db: DbOrTx, actor: Actor | null, input: { id: string }) {
  const grn = await getReceiptOrThrow(db, input.id);
  if (grn.status !== "draft") throw new AppError("Only draft goods receipts can be deleted");
  await db.delete(goodsReceipts).where(eq(goodsReceipts.id, grn.id));
  await logAudit(db, actor, { action: "delete", entity: "goods_receipt", entityId: grn.id, summary: `Deleted draft goods receipt ${grn.number}` });
  return { id: grn.id };
}

/** Remaining qty per PO line (ordered minus received in posted GRNs), for prefilling a GRN. */
export async function remainingToReceive(db: DbOrTx, orderId: string) {
  const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, orderId)).orderBy(purchaseOrderLines.lineNo);
  return lines.map((l) => ({ ...l, remaining: Math.max(round3(l.qty - l.receivedQty), 0) }));
}

/** Other draft receipts against the same PO (warn before receiving twice). */
export async function draftReceiptsForOrder(db: DbOrTx, orderId: string, exceptId?: string) {
  return db
    .select({ id: goodsReceipts.id, number: goodsReceipts.number })
    .from(goodsReceipts)
    .where(
      and(
        eq(goodsReceipts.purchaseOrderId, orderId),
        eq(goodsReceipts.status, "draft"),
        exceptId ? ne(goodsReceipts.id, exceptId) : undefined
      )
    );
}

export async function receiptLinesFor(db: DbOrTx, receiptIds: string[]) {
  if (!receiptIds.length) return [];
  return db.select().from(goodsReceiptLines).where(inArray(goodsReceiptLines.receiptId, receiptIds));
}
