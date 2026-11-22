import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { journalEntries, suppliers } from "@/db/schema";
import { round2, today } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { nextNumber } from "./numbering";
import { supplierSchema, type SupplierInput } from "./purchasing-schemas";

/** Opening balance owed to a supplier: Dr Opening Balance Equity, Cr Payable (supplier). */
async function postOpening(db: DbOrTx, actor: Actor | null, supplier: { id: string; code: string; name: string }, amount: number, date: string) {
  return postJournal(db, actor, {
    date,
    memo: `Opening balance — ${supplier.name}`,
    sourceType: "opening",
    sourceId: supplier.id,
    sourceNumber: supplier.code,
    lines: [
      { account: ACC.OPENING_BALANCE, debit: amount },
      { account: ACC.PAYABLE, credit: amount, partyType: "supplier", partyId: supplier.id },
    ],
  });
}

async function openingEntries(db: DbOrTx, supplierId: string) {
  return db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.sourceType, "opening"), eq(journalEntries.sourceId, supplierId), eq(journalEntries.status, "posted")));
}

export async function createSupplier(db: DbOrTx, actor: Actor | null, raw: SupplierInput) {
  const input = supplierSchema.parse(raw);
  const code = input.code ?? (await nextNumber(db, "SUPP"));
  const [dupe] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.code, code));
  if (dupe) throw new AppError(`Supplier code ${code} is already used`, { code: "Already used" });
  console.log("input", input)
  const [row] = await db
    .insert(suppliers)
    .values({
      code,
      name: input.name,
      contactPerson: input.contactPerson,
      phone: input.phone,
      altPhone: input.altPhone,
      email: input.email,
      address: input.address,
      city: input.city,
      taxNumber: input.taxNumber,
      cnic: input.cnic,
      paymentTermsDays: input.paymentTermsDays,
      creditLimit: input.creditLimit,
      openingBalance: round2(input.openingBalance),
      notes: input.notes,
      isActive: input.isActive,
    })
    .returning();

  console.log("row", row)

  if (row.openingBalance > 0) await postOpening(db, actor, row, row.openingBalance, input.openingDate ?? today());

  await logAudit(db, actor, { action: "create", entity: "supplier", entityId: row.id, summary: `Created supplier ${row.code} ${row.name}` });
  return { id: row.id };
}

export async function updateSupplier(db: DbOrTx, actor: Actor | null, raw: SupplierInput) {
  const input = supplierSchema.parse(raw);
  if (!input.id) throw new AppError("Supplier not found");
  const [current] = await db.select().from(suppliers).where(eq(suppliers.id, input.id));
  if (!current) throw new AppError("Supplier not found");
  const code = input.code ?? current.code;
  if (code !== current.code) {
    const [dupe] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.code, code));
    if (dupe) throw new AppError(`Supplier code ${code} is already used`, { code: "Already used" });
  }

  const opening = round2(input.openingBalance);
  await db
    .update(suppliers)
    .set({
      code,
      name: input.name,
      contactPerson: input.contactPerson,
      phone: input.phone,
      altPhone: input.altPhone,
      email: input.email,
      address: input.address,
      city: input.city,
      taxNumber: input.taxNumber,
      cnic: input.cnic,
      paymentTermsDays: input.paymentTermsDays,
      creditLimit: input.creditLimit,
      openingBalance: opening,
      notes: input.notes,
      isActive: input.isActive,
    })
    .where(eq(suppliers.id, current.id));

  // Correcting the opening balance replaces its journal (the old one is voided, never edited)
  if (opening !== round2(current.openingBalance)) {
    const old = await openingEntries(db, current.id);
    for (const e of old) await voidJournal(db, actor, e.id, "Opening balance changed");
    if (opening > 0) await postOpening(db, actor, { id: current.id, code, name: input.name }, opening, input.openingDate ?? old[0]?.date ?? today());
  }

  await logAudit(db, actor, { action: "update", entity: "supplier", entityId: current.id, summary: `Updated supplier ${code} ${input.name}` });
  return { id: current.id };
}

export async function setSupplierActive(db: DbOrTx, actor: Actor | null, input: { id: string; isActive: boolean }) {
  const [row] = await db.update(suppliers).set({ isActive: input.isActive }).where(eq(suppliers.id, input.id)).returning();
  if (!row) throw new AppError("Supplier not found");
  await logAudit(db, actor, {
    action: "update",
    entity: "supplier",
    entityId: row.id,
    summary: `${input.isActive ? "Activated" : "Deactivated"} supplier ${row.code} ${row.name}`,
  });
  return { id: row.id };
}
