import { asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { salesInvoiceLines, salesInvoices, salesReturnLines, salesReturns } from "@/db/schema";
import { formatMoney, round2, round3 } from "@/lib/format";
import { AppError } from "../errors";
import { assertNotLocked, postJournal, voidJournal, type JournalLineInput } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { nextNumber } from "./numbering";
import { refreshInvoicePayment } from "./sales";
import { assertCashBankAccount } from "./sales-receipts";
import { returnLineValue, type ReturnInput } from "./sales-schemas";
import { moveStock, reverseStockForSource } from "./stock";

/** Create a sales return against a posted invoice; posts immediately unless input.post is false. */
export async function createReturn(db: DbOrTx, actor: Actor | null, input: ReturnInput) {
  const [inv] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, input.invoiceId));
  if (!inv) throw new AppError("Invoice not found");
  if (inv.status !== "posted") throw new AppError(`Invoice ${inv.number} is not posted`);
  if (input.settlement === "refund") {
    if (!input.refundAccountId) throw new AppError("Pick the cash or bank account the refund is paid from", { refundAccountId: "Required for refunds" });
    await assertCashBankAccount(db, input.refundAccountId);
  }

  const ilines = await db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, inv.id));
  const byId = new Map(ilines.map((l) => [l.id, l]));
  const picked = input.lines.filter((l) => l.qty > 0);
  if (!picked.length) throw new AppError("Enter a quantity to return on at least one line");

  const rows = picked.map((p, i) => {
    const il = byId.get(p.invoiceLineId);
    if (!il) throw new AppError("Invoice line not found");
    const available = round3(il.qty - il.returnedQty);
    if (p.qty > available + 0.0005) throw new AppError(`"${il.description}": only ${available} can still be returned`);
    const qty = round3(p.qty);
    const v = returnLineValue(il, qty);
    const gross = round2(qty * il.unitPrice);
    return {
      lineNo: i + 1,
      productId: il.productId,
      description: il.description,
      qty,
      unitPrice: il.unitPrice,
      discountPct: il.discountPct,
      discountAmount: round2(gross - v.net),
      taxRate: il.taxRate,
      taxAmount: v.tax,
      lineTotal: v.total,
      invoiceLineId: il.id,
      unitCost: il.unitCost,
    };
  });
  const subtotal = round2(rows.reduce((s, r) => s + r.qty * r.unitPrice, 0));
  const taxTotal = round2(rows.reduce((s, r) => s + r.taxAmount, 0));
  const total = round2(rows.reduce((s, r) => s + r.lineTotal, 0));
  const costTotal = round2(rows.reduce((s, r) => s + round2(r.qty * r.unitCost), 0));

  const number = await nextNumber(db, "SR");
  const [ret] = await db
    .insert(salesReturns)
    .values({
      number,
      date: input.date,
      invoiceId: inv.id,
      customerId: inv.customerId,
      customerName: inv.customerName,
      warehouseId: inv.warehouseId,
      settlement: input.settlement,
      refundAccountId: input.settlement === "refund" ? input.refundAccountId : null,
      reason: input.reason ?? null,
      status: "draft",
      subtotal,
      discountTotal: round2(subtotal - (total - taxTotal)),
      documentDiscount: 0,
      taxTotal,
      shippingCharges: 0,
      roundOff: 0,
      total,
      costTotal,
      createdBy: actor?.id ?? null,
    })
    .returning();
  await db.insert(salesReturnLines).values(rows.map((r) => ({ ...r, returnId: ret.id })));
  await logAudit(db, actor, {
    action: "create",
    entity: "sales_return",
    entityId: ret.id,
    summary: `Created return ${number} against ${inv.number}: ${formatMoney(total)}`,
  });
  if (input.post) await postReturn(db, actor, ret.id);
  return { id: ret.id, number, total };
}

/**
 * Post a return: stock comes back at the original cost, then
 *   Dr Sales Returns (net), Dr Output tax, Cr Receivable (customer) or Cr Cash/Bank (refund)
 *   Dr Inventory / Cr COGS at cost.
 */
export async function postReturn(db: DbOrTx, actor: Actor | null, id: string) {
  const [ret] = await db.select().from(salesReturns).where(eq(salesReturns.id, id));
  if (!ret) throw new AppError("Return not found");
  if (ret.status !== "draft") throw new AppError(`Return ${ret.number} is already ${ret.status}`);
  if (!ret.invoiceId) throw new AppError("Return isn't linked to an invoice");
  await assertNotLocked(db, ret.date);
  const [inv] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, ret.invoiceId));
  if (!inv || inv.status !== "posted") throw new AppError("The original invoice is not posted");

  const lines = await db.select().from(salesReturnLines).where(eq(salesReturnLines.returnId, id)).orderBy(asc(salesReturnLines.lineNo));
  const ilines = await db
    .select()
    .from(salesInvoiceLines)
    .where(inArray(salesInvoiceLines.id, lines.map((l) => l.invoiceLineId).filter((x): x is string => !!x)));
  const ilById = new Map(ilines.map((l) => [l.id, l]));

  // Settlement rules
  const outstanding = round2(inv.total - inv.amountPaid);
  if (ret.settlement === "credit" && !inv.customerId && ret.total > outstanding + 0.005) {
    throw new AppError(
      `This walk-in invoice only has ${formatMoney(outstanding)} outstanding, so ${formatMoney(ret.total)} can't be kept as credit. Refund it instead.`
    );
  }
  if (ret.settlement === "refund") {
    if (!ret.refundAccountId) throw new AppError("Pick the account the refund is paid from");
    if (inv.paymentStatus === "unpaid") throw new AppError(`Invoice ${inv.number} hasn't been paid yet. Use a credit return instead of a refund.`);
  }

  let cost = 0;
  for (const l of lines) {
    const il = l.invoiceLineId ? ilById.get(l.invoiceLineId) : undefined;
    if (!il) throw new AppError(`"${l.description}" no longer matches the invoice`);
    const available = round3(il.qty - il.returnedQty);
    if (l.qty > available + 0.0005) throw new AppError(`"${l.description}": only ${available} can still be returned`);
    if (l.productId) {
      const res = await moveStock(db, actor, {
        date: ret.date,
        productId: l.productId,
        warehouseId: ret.warehouseId,
        qty: l.qty,
        unitCost: il.unitCost,
        batchId: il.batchId,
        sourceType: "sales_return",
        sourceId: ret.id,
        sourceNumber: ret.number,
      });
      cost = round2(cost + res.value);
    }
    await db.update(salesInvoiceLines).set({ returnedQty: round3(il.returnedQty + l.qty) }).where(eq(salesInvoiceLines.id, il.id));
    il.returnedQty = round3(il.returnedQty + l.qty);
  }

  const net = round2(ret.total - ret.taxTotal);
  const party = ret.customerId ? { partyType: "customer" as const, partyId: ret.customerId } : {};
  const jl: JournalLineInput[] = [
    { account: ACC.SALES_RETURNS, debit: net, memo: `Return against ${inv.number}` },
    { account: ACC.OUTPUT_TAX, debit: ret.taxTotal },
    ret.settlement === "refund"
      ? { account: ret.refundAccountId!, credit: ret.total, memo: `Refund to ${ret.customerName}` }
      : { account: ACC.RECEIVABLE, credit: ret.total, ...party, memo: ret.customerName },
  ];
  if (cost > 0) jl.push({ account: ACC.INVENTORY, debit: cost }, { account: ACC.COGS, credit: cost });

  let journalEntryId: string | null = null;
  if (jl.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0).length >= 2) {
    const entry = await postJournal(db, actor, {
      date: ret.date,
      memo: `Sales return ${ret.number} — ${ret.customerName}`,
      sourceType: "sales_return",
      sourceId: ret.id,
      sourceNumber: ret.number,
      lines: jl,
    });
    journalEntryId = entry.id;
  }
  await db.update(salesReturns).set({ status: "posted", journalEntryId, costTotal: cost }).where(eq(salesReturns.id, id));
  await refreshInvoicePayment(db, inv.id);
  await logAudit(db, actor, {
    action: "post",
    entity: "sales_return",
    entityId: id,
    summary: `Posted return ${ret.number} (${ret.settlement === "refund" ? "refund" : "credit"}) ${formatMoney(ret.total)}`,
  });
  return { id, number: ret.number };
}

/** Void a posted return (stock goes back out, journal voided) or delete a draft one. */
export async function voidReturn(db: DbOrTx, actor: Actor | null, id: string, reason?: string | null) {
  const [ret] = await db.select().from(salesReturns).where(eq(salesReturns.id, id));
  if (!ret) throw new AppError("Return not found");
  if (ret.status === "void") throw new AppError(`Return ${ret.number} is already void`);
  if (ret.status === "draft") {
    await db.delete(salesReturns).where(eq(salesReturns.id, id));
    await logAudit(db, actor, { action: "delete", entity: "sales_return", entityId: id, summary: `Deleted draft return ${ret.number}` });
    return { id, deleted: true };
  }
  await voidJournal(db, actor, ret.journalEntryId, reason ?? `Return ${ret.number} voided`);
  await reverseStockForSource(db, actor, "sales_return", id, ret.date);
  const lines = await db.select().from(salesReturnLines).where(eq(salesReturnLines.returnId, id));
  for (const l of lines) {
    if (!l.invoiceLineId) continue;
    const [il] = await db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.id, l.invoiceLineId));
    if (il) await db.update(salesInvoiceLines).set({ returnedQty: Math.max(0, round3(il.returnedQty - l.qty)) }).where(eq(salesInvoiceLines.id, il.id));
  }
  await db.update(salesReturns).set({ status: "void" }).where(eq(salesReturns.id, id));
  if (ret.invoiceId) await refreshInvoicePayment(db, ret.invoiceId);
  await logAudit(db, actor, {
    action: "void",
    entity: "sales_return",
    entityId: id,
    summary: `Voided return ${ret.number}${reason ? `: ${reason}` : ""}`,
  });
  return { id, deleted: false };
}
