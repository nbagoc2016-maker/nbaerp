// Supplier bills: from a GRN (clears GRNI), from a PO, or direct (optionally receiving stock).
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  accounts,
  goodsReceiptLines,
  goodsReceipts,
  paymentAllocations,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReturns,
  supplierBillLines,
  supplierBills,
  supplierPayments,
} from "@/db/schema";
import { addDays, round2, round3, today } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { nextNumber } from "./numbering";
import {
  assertNewBatchNo,
  bumpPurchaseOrderLine,
  computeDocLines,
  getSupplierOrThrow,
  getWarehouseOrThrow,
  loadProducts,
  QTY_EPS,
  refreshBillPayment,
  refreshPurchaseOrderStatus,
  refreshReceiptBillStatus,
} from "./purchasing-common";
import { supplierBillSchema, type SupplierBillInput } from "./purchasing-schemas";
import { createBatch, moveStock, reverseStockForSource } from "./stock";

/** Freight on supplier bills is expensed to Freight In. */
export const FREIGHT_IN = "5300";

type GrnLine = typeof goodsReceiptLines.$inferSelect;

export async function getBillOrThrow(db: DbOrTx, id: string) {
  const [bill] = await db.select().from(supplierBills).where(eq(supplierBills.id, id));
  if (!bill) throw new AppError("Supplier bill not found");
  return bill;
}

/**
 * Rolls of one product received on one GRN line are stored as separate receipt lines. A bill line
 * bills the whole group (same receipt, product, PO line and cost), filling rolls in order.
 */
export async function receiptLineGroup(db: DbOrTx, line: GrnLine) {
  return db
    .select()
    .from(goodsReceiptLines)
    .where(
      and(
        eq(goodsReceiptLines.receiptId, line.receiptId),
        eq(goodsReceiptLines.productId, line.productId),
        eq(goodsReceiptLines.unitCost, line.unitCost),
        line.purchaseOrderLineId ? eq(goodsReceiptLines.purchaseOrderLineId, line.purchaseOrderLineId) : isNull(goodsReceiptLines.purchaseOrderLineId)
      )
    )
    .orderBy(asc(goodsReceiptLines.batchNo), asc(goodsReceiptLines.id));
}

/** Unbilled qty of a GRN line's group. */
export async function unbilledForGroup(db: DbOrTx, line: GrnLine) {
  const group = await receiptLineGroup(db, line);
  return round3(group.reduce((s, r) => s + (r.qty - r.billedQty), 0));
}

/** Create or update a draft supplier bill. */
export async function saveSupplierBill(db: DbOrTx, actor: Actor | null, raw: SupplierBillInput) {
  const input = supplierBillSchema.parse(raw);
  const supplier = await getSupplierOrThrow(db, input.supplierId);
  const productMap = await loadProducts(db, input.lines.map((l) => l.productId));

  let grn: typeof goodsReceipts.$inferSelect | null = null;
  if (input.goodsReceiptId) {
    [grn] = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, input.goodsReceiptId));
    if (!grn) throw new AppError("Goods receipt not found");
    if (grn.status !== "posted") throw new AppError(`Goods receipt ${grn.number} must be posted before it can be billed`);
    if (grn.supplierId !== supplier.id) throw new AppError(`Goods receipt ${grn.number} belongs to another supplier`);
  }
  let po: typeof purchaseOrders.$inferSelect | null = null;
  if (input.purchaseOrderId) {
    [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.purchaseOrderId));
    if (!po) throw new AppError("Purchase order not found");
    if (po.supplierId !== supplier.id) throw new AppError(`Purchase order ${po.number} belongs to another supplier`);
    if (po.status === "draft" || po.status === "cancelled") throw new AppError(`Purchase order ${po.number} is ${po.status} and can't be billed`);
  }

  // Receipt lines referenced by the bill must be on posted GRNs of this supplier
  const grnLineIds = input.lines.map((l) => l.goodsReceiptLineId).filter((x): x is string => !!x);
  const grnLines = grnLineIds.length
    ? await db
        .select({ line: goodsReceiptLines, status: goodsReceipts.status, supplierId: goodsReceipts.supplierId, number: goodsReceipts.number })
        .from(goodsReceiptLines)
        .innerJoin(goodsReceipts, eq(goodsReceipts.id, goodsReceiptLines.receiptId))
        .where(inArray(goodsReceiptLines.id, grnLineIds))
    : [];
  const grnLineMap = new Map(grnLines.map((g) => [g.line.id, g]));

  const lines = input.lines.map((l, i) => {
    const n = i + 1;
    const product = l.productId ? productMap.get(l.productId)! : null;
    const isStock = product?.type === "stock";
    let purchaseOrderLineId = l.purchaseOrderLineId;
    if (l.goodsReceiptLineId) {
      const g = grnLineMap.get(l.goodsReceiptLineId);
      if (!g) throw new AppError(`Line ${n}: the goods receipt line no longer exists`);
      if (g.status !== "posted") throw new AppError(`Line ${n}: goods receipt ${g.number} is ${g.status}`);
      if (g.supplierId !== supplier.id) throw new AppError(`Line ${n}: goods receipt ${g.number} belongs to another supplier`);
      if (g.line.productId !== l.productId) throw new AppError(`Line ${n}: the product must match goods receipt ${g.number}`);
      purchaseOrderLineId = g.line.purchaseOrderLineId;
    } else if (isStock && !input.receivesStock) {
      throw new AppError(
        `Line ${n}: "${product!.name}" is a stock item. Bill it from a goods receipt, or tick "Receive the goods with this bill".`
      );
    }
    return {
      ...l,
      purchaseOrderLineId,
      expenseAccountId: isStock ? null : l.expenseAccountId,
      batchNo: isStock && !l.goodsReceiptLineId && product!.trackBatches ? l.batchNo : null,
      receives: isStock && !l.goodsReceiptLineId,
    };
  });

  // PO lines must belong to this supplier's orders
  const poLineIds = [...new Set(lines.map((l) => l.purchaseOrderLineId).filter((x): x is string => !!x))];
  if (poLineIds.length) {
    const rows = await db
      .select({ id: purchaseOrderLines.id, supplierId: purchaseOrders.supplierId })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.orderId))
      .where(inArray(purchaseOrderLines.id, poLineIds));
    if (rows.length !== poLineIds.length || rows.some((r) => r.supplierId !== supplier.id)) {
      throw new AppError("Some lines point to a purchase order of another supplier");
    }
  }

  // Expense accounts for service / non-stock lines
  const accIds = [...new Set(lines.map((l) => l.expenseAccountId).filter((x): x is string => !!x))];
  if (accIds.length) {
    const rows = await db.select().from(accounts).where(inArray(accounts.id, accIds));
    for (const id of accIds) {
      const a = rows.find((r) => r.id === id);
      if (!a) throw new AppError("An expense account on this bill no longer exists");
      if (a.isGroup) throw new AppError(`"${a.name}" is a header account; choose a postable account`);
    }
  }

  const warehouseId = input.warehouseId ?? grn?.warehouseId ?? po?.warehouseId ?? null;
  if (lines.some((l) => l.receives)) {
    if (!warehouseId) throw new AppError("Choose the warehouse that receives the goods", { warehouseId: "Required" });
    await getWarehouseOrThrow(db, warehouseId);
  }

  const dueDate = input.dueDate ?? addDays(input.date, supplier.paymentTermsDays);
  if (dueDate < input.date) throw new AppError("Due date can't be before the bill date", { dueDate: "Before the bill date" });
  const { lineValues, totals } = computeDocLines(lines, input);

  const header = {
    date: input.date,
    dueDate,
    supplierId: supplier.id,
    supplierInvoiceNo: input.supplierInvoiceNo,
    purchaseOrderId: po?.id ?? null,
    goodsReceiptId: grn?.id ?? null,
    warehouseId,
    receivesStock: lines.some((l) => l.receives),
    notes: input.notes,
    ...totals,
  };

  let id: string;
  let number: string;
  if (input.id) {
    const bill = await getBillOrThrow(db, input.id);
    if (bill.status !== "draft") throw new AppError("Only draft bills can be edited");
    await db.update(supplierBills).set(header).where(eq(supplierBills.id, bill.id));
    await db.delete(supplierBillLines).where(eq(supplierBillLines.billId, bill.id));
    id = bill.id;
    number = bill.number;
  } else {
    number = await nextNumber(db, "BILL");
    const [bill] = await db.insert(supplierBills).values({ ...header, number, createdBy: actor?.id ?? null }).returning();
    id = bill.id;
  }

  await db.insert(supplierBillLines).values(
    lines.map((l, i) => ({
      billId: id,
      lineNo: i + 1,
      productId: l.productId,
      description: l.description,
      goodsReceiptLineId: l.goodsReceiptLineId,
      purchaseOrderLineId: l.purchaseOrderLineId,
      expenseAccountId: l.expenseAccountId,
      batchNo: l.batchNo,
      ...lineValues[i],
    }))
  );

  await logAudit(db, actor, {
    action: input.id ? "update" : "create",
    entity: "supplier_bill",
    entityId: id,
    summary: `${input.id ? "Updated" : "Created"} supplier bill ${number} (${totals.total})`,
  });
  return { id, number };
}

/**
 * Post a bill. GRN lines: Dr GRNI at receipt value (bill price difference to Inventory).
 * Received-with-bill stock lines: Dr Inventory (stock in). Others: Dr expense account.
 * Plus Dr Input tax and Dr Freight In; Cr Payable (supplier) for the total.
 */
export async function postSupplierBill(db: DbOrTx, actor: Actor | null, input: { id: string }) {
  const bill = await getBillOrThrow(db, input.id);
  if (bill.status !== "draft") throw new AppError(`Bill ${bill.number} is already ${bill.status}`);
  const lines = await db.select().from(supplierBillLines).where(eq(supplierBillLines.billId, bill.id)).orderBy(asc(supplierBillLines.lineNo));
  if (!lines.length) throw new AppError("This bill has no lines");
  const productMap = await loadProducts(db, lines.map((l) => l.productId));

  const amounts = new Map<string, number>(); // account -> signed debit
  const add = (account: string, amount: number) => amounts.set(account, round2((amounts.get(account) ?? 0) + amount));
  const touchedReceipts = new Set<string>();
  const touchedOrders = new Set<string>();
  const usedBatchNos = new Set<string>();
  let seq = 0;

  for (const l of lines) {
    const net = round2(l.lineTotal - l.taxAmount);
    const product = l.productId ? productMap.get(l.productId)! : null;

    if (l.goodsReceiptLineId) {
      const [g] = await db
        .select({ line: goodsReceiptLines, status: goodsReceipts.status, number: goodsReceipts.number })
        .from(goodsReceiptLines)
        .innerJoin(goodsReceipts, eq(goodsReceipts.id, goodsReceiptLines.receiptId))
        .where(eq(goodsReceiptLines.id, l.goodsReceiptLineId));
      if (!g || g.status !== "posted") throw new AppError(`Line ${l.lineNo}: the goods receipt is no longer posted`);
      const group = await receiptLineGroup(db, g.line);
      const unbilled = round3(group.reduce((s, r) => s + (r.qty - r.billedQty), 0));
      if (l.qty > unbilled + QTY_EPS) {
        throw new AppError(`Line ${l.lineNo}: only ${unbilled} of "${l.description}" on ${g.number} is still unbilled`);
      }
      let left = l.qty;
      for (const r of group) {
        const take = round3(Math.min(left, r.qty - r.billedQty));
        if (take <= 0) continue;
        await db.update(goodsReceiptLines).set({ billedQty: round3(r.billedQty + take) }).where(eq(goodsReceiptLines.id, r.id));
        left = round3(left - take);
        if (left <= 0) break;
      }
      const grnValue = round2(l.qty * g.line.unitCost);
      add(ACC.GRNI, grnValue);
      add(ACC.INVENTORY, round2(net - grnValue)); // price variance vs the receipt cost
      touchedReceipts.add(g.line.receiptId);
    } else if (product?.type === "stock") {
      if (!bill.receivesStock || !bill.warehouseId) throw new AppError(`Line ${l.lineNo}: choose a warehouse to receive "${product.name}"`);
      let batchId: string | null = null;
      if (product.trackBatches) {
        const batchNo = l.batchNo?.trim() || `${bill.number}-${++seq}`;
        const key = `${product.id}|${batchNo.toLowerCase()}`;
        if (usedBatchNos.has(key)) throw new AppError(`Roll ${batchNo} of "${product.name}" is entered twice`);
        usedBatchNos.add(key);
        await assertNewBatchNo(db, product, batchNo);
        const unitCost = round2(net / l.qty);
        const batch = await createBatch(db, { productId: product.id, warehouseId: bill.warehouseId, batchNo, qty: l.qty, unitCost, receivedDate: bill.date });
        batchId = batch.id;
        await db.update(supplierBillLines).set({ batchNo }).where(eq(supplierBillLines.id, l.id));
      }
      await moveStock(db, actor, {
        date: bill.date,
        productId: product.id,
        warehouseId: bill.warehouseId,
        qty: l.qty,
        unitCost: round2(net / l.qty),
        batchId,
        sourceType: "supplier_bill",
        sourceId: bill.id,
        sourceNumber: bill.number,
      });
      add(ACC.INVENTORY, net);
      const o = await bumpPurchaseOrderLine(db, l.purchaseOrderLineId, "receivedQty", l.qty);
      if (o) touchedOrders.add(o);
    } else {
      add(l.expenseAccountId ?? ACC.GENERAL_EXPENSE, net);
    }
    const o = await bumpPurchaseOrderLine(db, l.purchaseOrderLineId, "billedQty", l.qty);
    if (o) touchedOrders.add(o);
  }
  add(ACC.INPUT_TAX, bill.taxTotal);
  add(FREIGHT_IN, bill.freightCharges);

  let journalEntryId: string | null = null;
  if (bill.total > 0) {
    const je = await postJournal(db, actor, {
      date: bill.date,
      memo: `Supplier bill ${bill.number}${bill.supplierInvoiceNo ? ` (inv ${bill.supplierInvoiceNo})` : ""}`,
      sourceType: "supplier_bill",
      sourceId: bill.id,
      sourceNumber: bill.number,
      lines: [
        ...[...amounts].map(([account, v]) => (v >= 0 ? { account, debit: v } : { account, credit: -v })),
        { account: ACC.PAYABLE, credit: bill.total, partyType: "supplier" as const, partyId: bill.supplierId },
      ],
    });
    journalEntryId = je.id;
  }

  await db.update(supplierBills).set({ status: "posted", postedAt: new Date(), journalEntryId }).where(eq(supplierBills.id, bill.id));
  await refreshBillPayment(db, bill.id);
  for (const r of touchedReceipts) await refreshReceiptBillStatus(db, r);
  for (const o of touchedOrders) await refreshPurchaseOrderStatus(db, o);

  await logAudit(db, actor, { action: "post", entity: "supplier_bill", entityId: bill.id, summary: `Posted supplier bill ${bill.number} (${bill.total})` });
  return { id: bill.id, number: bill.number, total: bill.total };
}

/** Void a posted bill that has no payments or returns against it. */
export async function voidSupplierBill(db: DbOrTx, actor: Actor | null, input: { id: string; reason?: string | null }) {
  const bill = await getBillOrThrow(db, input.id);
  if (bill.status !== "posted") throw new AppError(`Only posted bills can be voided (this one is ${bill.status})`);
  const [paid] = await db
    .select({ number: supplierPayments.number })
    .from(paymentAllocations)
    .innerJoin(supplierPayments, eq(supplierPayments.id, paymentAllocations.paymentId))
    .where(and(eq(paymentAllocations.billId, bill.id), eq(supplierPayments.status, "posted"), sql`${paymentAllocations.amount} > 0`))
    .limit(1);
  if (paid) throw new AppError(`Payment ${paid.number} is allocated to this bill. Void the payment first.`);
  const [ret] = await db
    .select({ number: purchaseReturns.number })
    .from(purchaseReturns)
    .where(and(eq(purchaseReturns.billId, bill.id), eq(purchaseReturns.status, "posted")))
    .limit(1);
  if (ret) throw new AppError(`Purchase return ${ret.number} is posted against this bill. Void the return first.`);

  await reverseStockForSource(db, actor, "supplier_bill", bill.id, today());
  await voidJournal(db, actor, bill.journalEntryId, input.reason ?? `Supplier bill ${bill.number} voided`);

  const lines = await db.select().from(supplierBillLines).where(eq(supplierBillLines.billId, bill.id));
  const productMap = await loadProducts(db, lines.map((l) => l.productId));
  const touchedReceipts = new Set<string>();
  const touchedOrders = new Set<string>();
  for (const l of lines) {
    if (l.goodsReceiptLineId) {
      const [g] = await db.select().from(goodsReceiptLines).where(eq(goodsReceiptLines.id, l.goodsReceiptLineId));
      if (g) {
        const group = (await receiptLineGroup(db, g)).reverse();
        let left = l.qty;
        for (const r of group) {
          const take = round3(Math.min(left, r.billedQty));
          if (take <= 0) continue;
          await db.update(goodsReceiptLines).set({ billedQty: round3(r.billedQty - take) }).where(eq(goodsReceiptLines.id, r.id));
          left = round3(left - take);
          if (left <= 0) break;
        }
        touchedReceipts.add(g.receiptId);
      }
    } else if (l.productId && productMap.get(l.productId)?.type === "stock" && bill.receivesStock) {
      const o = await bumpPurchaseOrderLine(db, l.purchaseOrderLineId, "receivedQty", -l.qty);
      if (o) touchedOrders.add(o);
    }
    const o = await bumpPurchaseOrderLine(db, l.purchaseOrderLineId, "billedQty", -l.qty);
    if (o) touchedOrders.add(o);
  }

  await db.update(supplierBills).set({ status: "void" }).where(eq(supplierBills.id, bill.id));
  for (const r of touchedReceipts) await refreshReceiptBillStatus(db, r);
  for (const o of touchedOrders) await refreshPurchaseOrderStatus(db, o);
  await logAudit(db, actor, {
    action: "void",
    entity: "supplier_bill",
    entityId: bill.id,
    summary: `Voided supplier bill ${bill.number}${input.reason ? `: ${input.reason}` : ""}`,
  });
  return { id: bill.id };
}

export async function deleteSupplierBill(db: DbOrTx, actor: Actor | null, input: { id: string }) {
  const bill = await getBillOrThrow(db, input.id);
  if (bill.status !== "draft") throw new AppError("Only draft bills can be deleted");
  await db.delete(supplierBills).where(eq(supplierBills.id, bill.id));
  await logAudit(db, actor, { action: "delete", entity: "supplier_bill", entityId: bill.id, summary: `Deleted draft supplier bill ${bill.number}` });
  return { id: bill.id };
}
