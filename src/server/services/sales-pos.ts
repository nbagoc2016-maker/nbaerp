import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { customerReceipts, receiptAllocations, salesInvoices } from "@/db/schema";
import { calcDocument } from "@/lib/doc-calc";
import { formatMoney, round2, today } from "@/lib/format";
import { AppError } from "../errors";
import type { Actor } from "./audit";
import { saveInvoice, voidInvoice, type SaleOptions } from "./sales";
import { createReceipt, voidReceipt } from "./sales-receipts";
import type { PosSaleInput } from "./sales-schemas";

/**
 * Complete a counter sale in one go: a posted invoice (channel "pos", POS-number) plus one receipt
 * per payment method, each allocated to that invoice. Cash beyond what's due is change.
 * Walk-in sales must be paid in full; a registered customer can leave a balance on account.
 */
export async function completePosSale(db: DbOrTx, actor: Actor | null, input: PosSaleInput, opts: SaleOptions = {}) {
  const date = input.date ?? today();
  const preview = calcDocument(
    input.lines.map((l) => ({ qty: l.qty, price: l.price, discountPct: l.discountPct, taxRate: l.taxRate })),
    { documentDiscount: input.documentDiscount }
  );
  const total = preview.total;

  const pays = input.payments.filter((p) => p.amount > 0);
  const nonCash = round2(pays.filter((p) => p.method !== "cash").reduce((s, p) => s + p.amount, 0));
  if (nonCash > total + 0.005) throw new AppError(`Card / bank payments (${formatMoney(nonCash)}) are more than the bill (${formatMoney(total)})`);
  const cashGiven = round2(pays.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0));
  const cashApplied = round2(Math.min(cashGiven, Math.max(0, total - nonCash)));
  const paid = round2(nonCash + cashApplied);
  const tendered = input.tendered ?? cashGiven;
  const change = round2(Math.max(0, tendered - cashApplied));
  if (!input.customerId && paid < total - 0.005) {
    throw new AppError(`Collect the full ${formatMoney(total)} for a walk-in sale (${formatMoney(round2(total - paid))} short), or pick a customer to put the balance on account.`);
  }

  const inv = await saveInvoice(
    db,
    actor,
    {
      date,
      dueDate: date,
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      warehouseId: input.warehouseId,
      salesOrderId: null,
      salesperson: null,
      notes: input.notes ?? null,
      lines: input.lines,
      documentDiscount: input.documentDiscount,
      charges: 0,
      post: true,
    },
    { ...opts, channel: "pos", series: "POS" }
  );

  // One receipt per payment line; cash is reduced to what was actually due
  const receipts: { id: string; number: string; method: string; amount: number }[] = [];
  let cashLeft = cashApplied;
  for (const p of pays) {
    const amount = p.method === "cash" ? round2(Math.min(p.amount, cashLeft)) : round2(p.amount);
    if (p.method === "cash") cashLeft = round2(cashLeft - amount);
    if (amount <= 0) continue;
    const r = await createReceipt(
      db,
      actor,
      {
        date,
        customerId: input.customerId,
        method: p.method,
        depositAccountId: p.accountId,
        amount,
        reference: p.reference ?? null,
        notes: null,
        allocations: [{ invoiceId: inv.id, amount }],
      },
      { memo: `POS payment for ${inv.number}`, notes: `POS sale ${inv.number}` }
    );
    receipts.push({ id: r.id, number: r.number, method: p.method, amount });
  }

  return {
    invoiceId: inv.id,
    number: inv.number,
    date,
    total,
    paid,
    change,
    balanceDue: round2(Math.max(0, total - paid)),
    receipts,
    warning: inv.warning,
  };
}

/**
 * Void a sale. For POS sales the payments taken at the counter for that sale are voided with it;
 * any other receipt allocated to the invoice must be voided separately first.
 */
export async function voidSale(db: DbOrTx, actor: Actor | null, invoiceId: string, reason?: string | null) {
  const [inv] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId));
  if (!inv) throw new AppError("Invoice not found");
  if (inv.channel === "pos") {
    const allocs = await db
      .select({ receiptId: receiptAllocations.receiptId, receiptAmount: customerReceipts.amount, notes: customerReceipts.notes })
      .from(receiptAllocations)
      .innerJoin(customerReceipts, eq(customerReceipts.id, receiptAllocations.receiptId))
      .where(and(eq(receiptAllocations.invoiceId, invoiceId), eq(customerReceipts.status, "posted")));
    for (const receiptId of new Set(allocs.map((a) => a.receiptId))) {
      const all = await db.select().from(receiptAllocations).where(eq(receiptAllocations.receiptId, receiptId));
      const onlyThis = all.every((a) => a.invoiceId === invoiceId);
      const takenAtCounter = allocs.find((a) => a.receiptId === receiptId)?.notes === `POS sale ${inv.number}`;
      if (onlyThis && takenAtCounter) await voidReceipt(db, actor, receiptId, `POS sale ${inv.number} voided`);
    }
  }
  return voidInvoice(db, actor, invoiceId, reason);
}
