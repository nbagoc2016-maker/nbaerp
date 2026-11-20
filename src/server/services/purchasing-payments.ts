// Supplier payments (with bill allocation) and purchase returns.
import { assertCashAvailable } from "./finance-accounts";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  accounts,
  batches,
  paymentAllocations,
  purchaseReturnLines,
  purchaseReturns,
  supplierBillLines,
  supplierBills,
  supplierPayments,
} from "@/db/schema";
import { round2, round3, today } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { nextNumber } from "./numbering";
import { defaultWarehouse, getSupplierOrThrow, loadProducts, MONEY_EPS, QTY_EPS, refreshBillPayment } from "./purchasing-common";
import { purchaseReturnSchema, supplierPaymentSchema, type PurchaseReturnInput, type SupplierPaymentInput } from "./purchasing-schemas";
import { moveStock, reverseStockForSource } from "./stock";

// ---- Supplier payments ----------------------------------------------------------------------

export async function getPaymentOrThrow(db: DbOrTx, id: string) {
  const [p] = await db.select().from(supplierPayments).where(eq(supplierPayments.id, id));
  if (!p) throw new AppError("Supplier payment not found");
  return p;
}

/**
 * Record a payment: Dr Payable (supplier) / Cr Cash or Bank. Allocations settle bills; anything
 * left unallocated stays on the supplier's account as an advance (a debit on the payable).
 */
export async function recordSupplierPayment(db: DbOrTx, actor: Actor | null, raw: SupplierPaymentInput) {
  const input = supplierPaymentSchema.parse(raw);
  const supplier = await getSupplierOrThrow(db, input.supplierId);
  const [acc] = await db.select().from(accounts).where(eq(accounts.id, input.paidFromAccountId));
  if (!acc || acc.isGroup || !acc.isActive || (acc.subtype !== "cash" && acc.subtype !== "bank")) {
    throw new AppError("Choose a cash or bank account to pay from", { paidFromAccountId: "Choose a cash or bank account" });
  }
  // Cash in hand can't be overdrawn (same rule as the Accounting screens)
  await assertCashAvailable(db, acc, input.amount, input.date);

  // Merge duplicate bill rows, then check each against what is still open
  const byBill = new Map<string, number>();
  for (const a of input.allocations) byBill.set(a.billId, round2((byBill.get(a.billId) ?? 0) + a.amount));
  const allocated = round2([...byBill.values()].reduce((s, v) => s + v, 0));
  if (allocated > input.amount + MONEY_EPS) {
    throw new AppError(`Allocations (${allocated}) are more than the payment amount (${input.amount})`, { amount: "Less than allocated" });
  }
  if (byBill.size) {
    const bills = await db.select().from(supplierBills).where(inArray(supplierBills.id, [...byBill.keys()]));
    for (const [billId, amount] of byBill) {
      const b = bills.find((x) => x.id === billId);
      if (!b) throw new AppError("A bill in the allocation no longer exists");
      if (b.supplierId !== supplier.id) throw new AppError(`Bill ${b.number} belongs to another supplier`);
      if (b.status !== "posted") throw new AppError(`Bill ${b.number} is ${b.status}`);
      const res = await refreshBillPayment(db, b.id);
      const open = res?.outstanding ?? 0;
      if (amount > open + MONEY_EPS) throw new AppError(`Bill ${b.number} only has ${open} outstanding`);
    }
  }

  const number = await nextNumber(db, "PAY");
  const [payment] = await db
    .insert(supplierPayments)
    .values({
      number,
      date: input.date,
      supplierId: supplier.id,
      method: input.method,
      paidFromAccountId: acc.id,
      amount: round2(input.amount),
      reference: input.reference,
      notes: input.notes,
      status: "posted",
      createdBy: actor?.id ?? null,
    })
    .returning();
  if (byBill.size) {
    await db.insert(paymentAllocations).values([...byBill].map(([billId, amount]) => ({ paymentId: payment.id, billId, amount })));
  }

  const je = await postJournal(db, actor, {
    date: input.date,
    memo: `Payment ${number} to ${supplier.name}${input.reference ? ` (ref ${input.reference})` : ""}`,
    sourceType: "supplier_payment",
    sourceId: payment.id,
    sourceNumber: number,
    lines: [
      { account: ACC.PAYABLE, debit: payment.amount, partyType: "supplier", partyId: supplier.id },
      { account: acc.id, credit: payment.amount },
    ],
  });
  await db.update(supplierPayments).set({ journalEntryId: je.id }).where(eq(supplierPayments.id, payment.id));
  for (const billId of byBill.keys()) await refreshBillPayment(db, billId);

  await logAudit(db, actor, {
    action: "create",
    entity: "supplier_payment",
    entityId: payment.id,
    summary: `Recorded payment ${number} of ${payment.amount} to ${supplier.name}`,
  });
  return { id: payment.id, number };
}

export async function voidSupplierPayment(db: DbOrTx, actor: Actor | null, input: { id: string; reason?: string | null }) {
  const payment = await getPaymentOrThrow(db, input.id);
  if (payment.status !== "posted") throw new AppError("This payment is already void");
  await voidJournal(db, actor, payment.journalEntryId, input.reason ?? `Payment ${payment.number} voided`);
  await db.update(supplierPayments).set({ status: "void" }).where(eq(supplierPayments.id, payment.id));
  const allocs = await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id));
  for (const a of allocs) await refreshBillPayment(db, a.billId);
  await logAudit(db, actor, {
    action: "void",
    entity: "supplier_payment",
    entityId: payment.id,
    summary: `Voided payment ${payment.number}${input.reason ? `: ${input.reason}` : ""}`,
  });
  return { id: payment.id };
}

// ---- Purchase returns -----------------------------------------------------------------------

export async function getReturnOrThrow(db: DbOrTx, id: string) {
  const [r] = await db.select().from(purchaseReturns).where(eq(purchaseReturns.id, id));
  if (!r) throw new AppError("Purchase return not found");
  return r;
}

/** Qty already returned per bill line on posted returns (optionally ignoring one return). */
export async function returnedQtyByBillLine(db: DbOrTx, billId: string, exceptReturnId?: string) {
  const rows = await db
    .select({ billLineId: purchaseReturnLines.billLineId, qty: sql<number>`sum(${purchaseReturnLines.qty})`.mapWith(Number) })
    .from(purchaseReturnLines)
    .innerJoin(purchaseReturns, eq(purchaseReturns.id, purchaseReturnLines.returnId))
    .where(
      and(
        eq(purchaseReturns.billId, billId),
        eq(purchaseReturns.status, "posted"),
        exceptReturnId ? ne(purchaseReturns.id, exceptReturnId) : undefined
      )
    )
    .groupBy(purchaseReturnLines.billLineId);
  return new Map(rows.map((r) => [r.billLineId ?? "", round3(r.qty)]));
}

/** Cost of returning qty of a bill line: its net unit cost (after discounts) and tax share. */
function returnLineAmounts(billLine: typeof supplierBillLines.$inferSelect, qty: number) {
  const billNet = round2(billLine.lineTotal - billLine.taxAmount);
  const ratio = billLine.qty ? qty / billLine.qty : 0;
  const net = round2(billNet * ratio);
  const taxAmount = round2(billLine.taxAmount * ratio);
  return { net, taxAmount, lineTotal: round2(net + taxAmount), unitCost: billLine.qty ? round2(billNet / billLine.qty) : 0 };
}

/** Create or update a draft purchase return against a posted bill. */
export async function savePurchaseReturn(db: DbOrTx, actor: Actor | null, raw: PurchaseReturnInput) {
  const input = purchaseReturnSchema.parse(raw);
  const [bill] = await db.select().from(supplierBills).where(eq(supplierBills.id, input.billId));
  if (!bill) throw new AppError("Supplier bill not found");
  if (bill.status !== "posted") throw new AppError(`Bill ${bill.number} must be posted before goods can be returned`);
  const billLines = await db.select().from(supplierBillLines).where(eq(supplierBillLines.billId, bill.id));
  const returned = await returnedQtyByBillLine(db, bill.id, input.id ?? undefined);
  const productMap = await loadProducts(db, billLines.map((l) => l.productId));

  const rows = input.lines.map((l) => {
    const bl = billLines.find((x) => x.id === l.billLineId);
    if (!bl) throw new AppError("A line doesn't belong to this bill");
    const left = round3(bl.qty - (returned.get(bl.id) ?? 0));
    if (l.qty > left + QTY_EPS) throw new AppError(`Only ${left} of "${bl.description}" can still be returned`);
    const product = bl.productId ? productMap.get(bl.productId) : null;
    const amounts = returnLineAmounts(bl, l.qty);
    return {
      billLineId: bl.id,
      lineNo: bl.lineNo,
      productId: bl.productId,
      description: bl.description,
      qty: round3(l.qty),
      unitCost: amounts.unitCost,
      discountPct: 0,
      discountAmount: 0,
      taxRate: bl.taxRate,
      taxAmount: amounts.taxAmount,
      lineTotal: amounts.lineTotal,
      batchId: product?.trackBatches ? l.batchId : null,
    };
  });

  const warehouseId = bill.warehouseId ?? (await defaultWarehouse(db))?.id;
  if (!warehouseId) throw new AppError("Set up a warehouse first");
  const subtotal = round2(rows.reduce((s, r) => s + (r.lineTotal - r.taxAmount), 0));
  const taxTotal = round2(rows.reduce((s, r) => s + r.taxAmount, 0));
  const header = {
    date: input.date,
    billId: bill.id,
    supplierId: bill.supplierId,
    warehouseId,
    reason: input.reason,
    subtotal,
    discountTotal: 0,
    documentDiscount: 0,
    taxTotal,
    freightCharges: 0,
    total: round2(subtotal + taxTotal),
  };

  let id: string;
  let number: string;
  if (input.id) {
    const ret = await getReturnOrThrow(db, input.id);
    if (ret.status !== "draft") throw new AppError("Only draft returns can be edited");
    await db.update(purchaseReturns).set(header).where(eq(purchaseReturns.id, ret.id));
    await db.delete(purchaseReturnLines).where(eq(purchaseReturnLines.returnId, ret.id));
    id = ret.id;
    number = ret.number;
  } else {
    number = await nextNumber(db, "PR");
    const [ret] = await db.insert(purchaseReturns).values({ ...header, number, createdBy: actor?.id ?? null }).returning();
    id = ret.id;
  }
  await db.insert(purchaseReturnLines).values(rows.map((r) => ({ ...r, returnId: id })));

  await logAudit(db, actor, {
    action: input.id ? "update" : "create",
    entity: "purchase_return",
    entityId: id,
    summary: `${input.id ? "Updated" : "Created"} purchase return ${number} against ${bill.number} (${header.total})`,
  });
  return { id, number };
}

/**
 * Post a return: stock out (at moving-average cost), Dr Payable (supplier) for the bill value,
 * Cr Inventory at the cost that left stock, Cr Input tax; the bill-cost vs average-cost
 * difference goes to Inventory Adjustments 5200. Non-stock lines credit their expense account.
 */
export async function postPurchaseReturn(db: DbOrTx, actor: Actor | null, input: { id: string }) {
  const ret = await getReturnOrThrow(db, input.id);
  if (ret.status !== "draft") throw new AppError(`Return ${ret.number} is already ${ret.status}`);
  if (!ret.billId) throw new AppError("This return isn't linked to a bill");
  const [bill] = await db.select().from(supplierBills).where(eq(supplierBills.id, ret.billId));
  if (!bill || bill.status !== "posted") throw new AppError("The bill for this return is no longer posted");
  const lines = await db.select().from(purchaseReturnLines).where(eq(purchaseReturnLines.returnId, ret.id)).orderBy(asc(purchaseReturnLines.lineNo));
  if (!lines.length) throw new AppError("This return has no lines");
  const billLines = await db.select().from(supplierBillLines).where(eq(supplierBillLines.billId, bill.id));
  const returned = await returnedQtyByBillLine(db, bill.id, ret.id);
  const productMap = await loadProducts(db, lines.map((l) => l.productId));

  const credits = new Map<string, number>(); // account -> signed credit
  const add = (account: string, amount: number) => credits.set(account, round2((credits.get(account) ?? 0) + amount));

  for (const l of lines) {
    const bl = billLines.find((x) => x.id === l.billLineId);
    if (!bl) throw new AppError(`"${l.description}" is no longer on the bill`);
    const left = round3(bl.qty - (returned.get(bl.id) ?? 0));
    if (l.qty > left + QTY_EPS) throw new AppError(`Only ${left} of "${bl.description}" can still be returned`);
    returned.set(bl.id, round3((returned.get(bl.id) ?? 0) + l.qty));
    const net = round2(l.lineTotal - l.taxAmount);
    const product = l.productId ? productMap.get(l.productId) : null;

    if (product?.type === "stock") {
      if (product.trackBatches) {
        if (!l.batchId) throw new AppError(`Choose the roll / batch of "${product.name}" being returned`);
        const [b] = await db.select().from(batches).where(eq(batches.id, l.batchId));
        if (!b || b.productId !== product.id || b.warehouseId !== ret.warehouseId) {
          throw new AppError(`The chosen roll isn't ${product.name} in this warehouse`);
        }
      }
      const res = await moveStock(db, actor, {
        date: ret.date,
        productId: product.id,
        warehouseId: ret.warehouseId,
        qty: -l.qty,
        batchId: l.batchId,
        sourceType: "purchase_return",
        sourceId: ret.id,
        sourceNumber: ret.number,
      });
      const cost = round2(-res.value);
      add(ACC.INVENTORY, cost);
      add(ACC.INVENTORY_ADJUSTMENT, round2(net - cost));
    } else {
      add(bl.expenseAccountId ?? ACC.GENERAL_EXPENSE, net);
    }
  }
  add(ACC.INPUT_TAX, ret.taxTotal);

  let journalEntryId: string | null = null;
  if (ret.total > 0) {
    const je = await postJournal(db, actor, {
      date: ret.date,
      memo: `Purchase return ${ret.number} against ${bill.number}`,
      sourceType: "purchase_return",
      sourceId: ret.id,
      sourceNumber: ret.number,
      lines: [
        { account: ACC.PAYABLE, debit: ret.total, partyType: "supplier", partyId: ret.supplierId },
        ...[...credits].map(([account, v]) => (v >= 0 ? { account, credit: v } : { account, debit: -v })),
      ],
    });
    journalEntryId = je.id;
  }
  await db.update(purchaseReturns).set({ status: "posted", journalEntryId }).where(eq(purchaseReturns.id, ret.id));
  await refreshBillPayment(db, bill.id);
  await logAudit(db, actor, { action: "post", entity: "purchase_return", entityId: ret.id, summary: `Posted purchase return ${ret.number} (${ret.total})` });
  return { id: ret.id, number: ret.number, total: ret.total };
}

export async function voidPurchaseReturn(db: DbOrTx, actor: Actor | null, input: { id: string; reason?: string | null }) {
  const ret = await getReturnOrThrow(db, input.id);
  if (ret.status !== "posted") throw new AppError(`Only posted returns can be voided (this one is ${ret.status})`);
  await reverseStockForSource(db, actor, "purchase_return", ret.id, today());
  await voidJournal(db, actor, ret.journalEntryId, input.reason ?? `Purchase return ${ret.number} voided`);
  await db.update(purchaseReturns).set({ status: "void" }).where(eq(purchaseReturns.id, ret.id));
  if (ret.billId) await refreshBillPayment(db, ret.billId);
  await logAudit(db, actor, {
    action: "void",
    entity: "purchase_return",
    entityId: ret.id,
    summary: `Voided purchase return ${ret.number}${input.reason ? `: ${input.reason}` : ""}`,
  });
  return { id: ret.id };
}

export async function deletePurchaseReturn(db: DbOrTx, actor: Actor | null, input: { id: string }) {
  const ret = await getReturnOrThrow(db, input.id);
  if (ret.status !== "draft") throw new AppError("Only draft returns can be deleted");
  await db.delete(purchaseReturns).where(eq(purchaseReturns.id, ret.id));
  await logAudit(db, actor, { action: "delete", entity: "purchase_return", entityId: ret.id, summary: `Deleted draft purchase return ${ret.number}` });
  return { id: ret.id };
}
