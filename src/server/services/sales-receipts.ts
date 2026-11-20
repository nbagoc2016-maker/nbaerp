import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { accounts, customerReceipts, customers, receiptAllocations, salesInvoices } from "@/db/schema";
import { formatMoney, round2 } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { nextNumber } from "./numbering";
import { refreshInvoicePayment } from "./sales";
import type { ReceiptInput } from "./sales-schemas";

/** Posted invoices with money still owed, oldest first (FIFO order for allocation). */
export async function openInvoicesFor(db: DbOrTx, customerId: string | null) {
  const rows = await db
    .select({
      id: salesInvoices.id,
      number: salesInvoices.number,
      date: salesInvoices.date,
      dueDate: salesInvoices.dueDate,
      customerName: salesInvoices.customerName,
      total: salesInvoices.total,
      amountPaid: salesInvoices.amountPaid,
    })
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.status, "posted"),
        ne(salesInvoices.paymentStatus, "paid"),
        customerId ? eq(salesInvoices.customerId, customerId) : isNull(salesInvoices.customerId)
      )
    )
    .orderBy(asc(salesInvoices.date), asc(salesInvoices.number));
  return rows.map((r) => ({ ...r, outstanding: round2(r.total - r.amountPaid) })).filter((r) => r.outstanding > 0.005);
}

export async function assertCashBankAccount(db: DbOrTx, accountId: string) {
  const [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!acc || acc.isGroup || !acc.isActive || !["cash", "bank", "petty_cash"].includes(acc.subtype ?? "")) {
    throw new AppError("Pick a cash or bank account", { depositAccountId: "Pick a cash or bank account" });
  }
  return acc;
}

/**
 * Record money received from a customer: Dr Cash/Bank, Cr Receivable (customer). Allocations
 * settle open invoices; anything left over stays on the customer's account as credit.
 */
export async function createReceipt(
  db: DbOrTx,
  actor: Actor | null,
  input: ReceiptInput,
  extra: { memo?: string; notes?: string | null } = {}
) {
  const amount = round2(input.amount);
  if (amount <= 0) throw new AppError("Amount must be more than zero");
  let customerName = "Walk-in customer";
  if (input.customerId) {
    const [c] = await db.select().from(customers).where(eq(customers.id, input.customerId));
    if (!c) throw new AppError("Customer not found");
    customerName = c.name;
  }
  const account = await assertCashBankAccount(db, input.depositAccountId);

  // Merge and validate allocations
  const merged = new Map<string, number>();
  for (const a of input.allocations) if (a.amount > 0) merged.set(a.invoiceId, round2((merged.get(a.invoiceId) ?? 0) + a.amount));
  const allocTotal = round2([...merged.values()].reduce((s, v) => s + v, 0));
  if (allocTotal > amount + 0.005) throw new AppError(`Allocated ${formatMoney(allocTotal)} is more than the amount received ${formatMoney(amount)}`);
  if (merged.size) {
    const invs = await db.select().from(salesInvoices).where(inArray(salesInvoices.id, [...merged.keys()]));
    for (const [invoiceId, amt] of merged) {
      const inv = invs.find((i) => i.id === invoiceId);
      if (!inv) throw new AppError("Invoice not found");
      if (inv.status !== "posted") throw new AppError(`Invoice ${inv.number} is not posted`);
      if ((inv.customerId ?? null) !== (input.customerId ?? null)) throw new AppError(`Invoice ${inv.number} belongs to a different customer`);
      const outstanding = round2(inv.total - inv.amountPaid);
      if (amt > outstanding + 0.005) throw new AppError(`Invoice ${inv.number} only has ${formatMoney(outstanding)} outstanding`);
    }
  }
  if (!input.customerId && Math.abs(allocTotal - amount) > 0.005) {
    throw new AppError("Payments without a customer must be fully allocated to walk-in invoices. Pick a customer to keep credit on account.");
  }

  const number = await nextNumber(db, "RCPT");
  const [receipt] = await db
    .insert(customerReceipts)
    .values({
      number,
      date: input.date,
      customerId: input.customerId ?? null,
      method: input.method,
      depositAccountId: account.id,
      amount,
      reference: input.reference ?? null,
      notes: extra.notes ?? input.notes ?? null,
      status: "posted",
      createdBy: actor?.id ?? null,
    })
    .returning();
  if (merged.size) {
    await db.insert(receiptAllocations).values([...merged].map(([invoiceId, amt]) => ({ receiptId: receipt.id, invoiceId, amount: amt })));
  }

  const entry = await postJournal(db, actor, {
    date: input.date,
    memo: extra.memo ?? `Receipt ${number} from ${customerName}`,
    sourceType: "customer_receipt",
    sourceId: receipt.id,
    sourceNumber: number,
    lines: [
      { account: account.id, debit: amount, memo: input.reference ?? null },
      {
        account: ACC.RECEIVABLE,
        credit: amount,
        partyType: input.customerId ? "customer" : null,
        partyId: input.customerId ?? null,
        memo: customerName,
      },
    ],
  });
  await db.update(customerReceipts).set({ journalEntryId: entry.id }).where(eq(customerReceipts.id, receipt.id));
  for (const invoiceId of merged.keys()) await refreshInvoicePayment(db, invoiceId);

  await logAudit(db, actor, {
    action: "create",
    entity: "customer_receipt",
    entityId: receipt.id,
    summary: `Received ${formatMoney(amount)} from ${customerName} (${number})${allocTotal < amount ? `, ${formatMoney(round2(amount - allocTotal))} on account` : ""}`,
  });
  return { id: receipt.id, number, amount, allocated: allocTotal, unallocated: round2(amount - allocTotal) };
}

/** Void a receipt: its journal is voided and the invoices it paid become open again. */
export async function voidReceipt(db: DbOrTx, actor: Actor | null, id: string, reason?: string | null) {
  const [r] = await db.select().from(customerReceipts).where(eq(customerReceipts.id, id));
  if (!r) throw new AppError("Receipt not found");
  if (r.status !== "posted") throw new AppError(`Receipt ${r.number} is already void`);
  await voidJournal(db, actor, r.journalEntryId, reason ?? `Receipt ${r.number} voided`);
  await db.update(customerReceipts).set({ status: "void" }).where(eq(customerReceipts.id, id));
  const allocs = await db.select({ invoiceId: receiptAllocations.invoiceId }).from(receiptAllocations).where(eq(receiptAllocations.receiptId, id));
  for (const invoiceId of new Set(allocs.map((a) => a.invoiceId))) await refreshInvoicePayment(db, invoiceId);
  await logAudit(db, actor, {
    action: "void",
    entity: "customer_receipt",
    entityId: id,
    summary: `Voided receipt ${r.number} (${formatMoney(r.amount)})${reason ? `: ${reason}` : ""}`,
  });
  return { id };
}

/** Sum of allocations per receipt (for "unallocated / on account" displays). */
export async function receiptAllocatedTotals(db: DbOrTx, receiptIds: string[]) {
  if (!receiptIds.length) return new Map<string, number>();
  const rows = await db
    .select({
      receiptId: receiptAllocations.receiptId,
      sum: sql<number>`coalesce(sum(${receiptAllocations.amount}), 0)`.mapWith(Number),
    })
    .from(receiptAllocations)
    .where(inArray(receiptAllocations.receiptId, receiptIds))
    .groupBy(receiptAllocations.receiptId);
  return new Map(rows.map((r) => [r.receiptId, round2(r.sum)]));
}
