import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { customers, journalEntries } from "@/db/schema";
import { round2, today } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { nextNumber } from "./numbering";
import type { CustomerInput } from "./sales-schemas";

function customerValues(input: CustomerInput) {
  return {
    name: input.name,
    type: input.type,
    priceLevel: input.priceLevel,
    contactPerson: input.contactPerson,
    phone: input.phone,
    altPhone: input.altPhone,
    email: input.email,
    address: input.address,
    city: input.city,
    taxNumber: input.taxNumber,
    cnic: input.cnic,
    paymentTermsDays: input.paymentTermsDays,
    creditLimit: round2(input.creditLimit),
    notes: input.notes,
    isActive: input.isActive,
  };
}

async function openingEntry(db: DbOrTx, customerId: string) {
  const [row] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.sourceType, "opening"), eq(journalEntries.sourceId, customerId), eq(journalEntries.status, "posted")));
  return row ?? null;
}

async function postOpening(db: DbOrTx, actor: Actor | null, customer: { id: string; code: string; name: string }, amount: number, date: string) {
  return postJournal(db, actor, {
    date,
    memo: `Opening balance — ${customer.name}`,
    sourceType: "opening",
    sourceId: customer.id,
    sourceNumber: customer.code,
    lines: [
      { account: ACC.RECEIVABLE, debit: amount, partyType: "customer", partyId: customer.id, memo: "Opening balance" },
      { account: ACC.OPENING_BALANCE, credit: amount, memo: `Customer ${customer.code}` },
    ],
  });
}

/** Create a customer. An opening balance (> 0) is posted once: Dr Receivable (customer) / Cr Opening Balance Equity. */
export async function createCustomer(db: DbOrTx, actor: Actor | null, input: CustomerInput) {
  const code = await nextNumber(db, "CUST");
  const opening = round2(input.openingBalance ?? 0);
  const [row] = await db
    .insert(customers)
    .values({ ...customerValues(input), code, openingBalance: opening })
    .returning();
  if (opening > 0) await postOpening(db, actor, row, opening, input.openingDate ?? today());
  await logAudit(db, actor, {
    action: "create",
    entity: "customer",
    entityId: row.id,
    summary: `Created customer ${row.code} ${row.name}${opening > 0 ? ` with opening balance ${opening}` : ""}`,
  });
  return { id: row.id, code: row.code, name: row.name };
}

/**
 * Update a customer's details. The opening balance can only be set while none has been posted;
 * after that it's part of the books and must be corrected with a journal entry.
 */
export async function updateCustomer(db: DbOrTx, actor: Actor | null, input: CustomerInput & { id: string }) {
  const [current] = await db.select().from(customers).where(eq(customers.id, input.id));
  if (!current) throw new AppError("Customer not found");
  const opening = round2(input.openingBalance ?? 0);
  const existing = await openingEntry(db, current.id);
  let openingBalance = current.openingBalance;
  if (opening !== current.openingBalance) {
    if (existing) {
      throw new AppError("The opening balance is already posted to the books. Correct it with a journal entry instead.", {
        openingBalance: "Already posted",
      });
    }
    if (opening > 0) await postOpening(db, actor, current, opening, input.openingDate ?? today());
    openingBalance = opening;
  }
  await db
    .update(customers)
    .set({ ...customerValues(input), openingBalance })
    .where(eq(customers.id, current.id));
  await logAudit(db, actor, { action: "update", entity: "customer", entityId: current.id, summary: `Updated customer ${current.code} ${input.name}` });
  return { id: current.id, code: current.code, name: input.name };
}

export async function setCustomerActive(db: DbOrTx, actor: Actor | null, id: string, isActive: boolean) {
  const [row] = await db.update(customers).set({ isActive }).where(eq(customers.id, id)).returning();
  if (!row) throw new AppError("Customer not found");
  await logAudit(db, actor, {
    action: "update",
    entity: "customer",
    entityId: id,
    summary: `${isActive ? "Activated" : "Deactivated"} customer ${row.code} ${row.name}`,
  });
  return { id };
}
