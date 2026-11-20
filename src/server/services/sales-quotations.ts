import { asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { quotationLines, quotations } from "@/db/schema";
import { today } from "@/lib/format";
import { AppError } from "../errors";
import { logAudit, type Actor } from "./audit";
import { nextNumber } from "./numbering";
import { buildSaleLines, getDefaultWarehouseId, resolveCustomer, saveInvoice, toCalcLine, totalsFrom, type SaleOptions } from "./sales";
import { saveOrder } from "./sales-orders";
import type { QuotationInput } from "./sales-schemas";

export type QuotationStatus = (typeof quotations.$inferSelect)["status"];

async function loadQuotation(db: DbOrTx, id: string) {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
  if (!q) throw new AppError("Quotation not found");
  return q;
}

/** Create or update a quotation (drafts and sent quotations can still be edited). */
export async function saveQuotation(db: DbOrTx, actor: Actor | null, input: QuotationInput, opts: SaleOptions = {}) {
  const { customer, name } = await resolveCustomer(db, input.customerId, input.customerName);
  const { calc, rows } = await buildSaleLines(db, input, { ...opts, priceLevel: customer?.priceLevel });
  const header = {
    date: input.date,
    validUntil: input.validUntil ?? null,
    customerId: customer?.id ?? null,
    customerName: customer ? customer.name : input.customerName?.trim() || name,
    terms: input.terms ?? null,
    notes: input.notes ?? null,
    ...totalsFrom(calc),
  };
  let id: string;
  let number: string;
  if (input.id) {
    const cur = await loadQuotation(db, input.id);
    if (cur.status !== "draft" && cur.status !== "sent") throw new AppError(`Quotation ${cur.number} is ${cur.status} and can't be edited`);
    await db.update(quotations).set(header).where(eq(quotations.id, cur.id));
    await db.delete(quotationLines).where(eq(quotationLines.quotationId, cur.id));
    id = cur.id;
    number = cur.number;
    await logAudit(db, actor, { action: "update", entity: "quotation", entityId: id, summary: `Updated quotation ${number}` });
  } else {
    number = await nextNumber(db, "QT");
    const [row] = await db
      .insert(quotations)
      .values({ ...header, number, status: "draft", createdBy: actor?.id ?? null })
      .returning();
    id = row.id;
    await logAudit(db, actor, { action: "create", entity: "quotation", entityId: id, summary: `Created quotation ${number} for ${header.customerName}` });
  }
  await db.insert(quotationLines).values(rows.map((r) => ({ ...r, quotationId: id })));
  return { id, number };
}

const TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  draft: ["sent", "accepted", "rejected", "expired"],
  sent: ["accepted", "rejected", "expired", "draft"],
  accepted: ["sent", "rejected"],
  rejected: ["draft"],
  expired: ["draft"],
  converted: [],
};

export async function setQuotationStatus(db: DbOrTx, actor: Actor | null, id: string, status: QuotationStatus) {
  const q = await loadQuotation(db, id);
  if (!TRANSITIONS[q.status].includes(status)) throw new AppError(`A ${q.status} quotation can't be marked ${status}`);
  await db.update(quotations).set({ status }).where(eq(quotations.id, id));
  await logAudit(db, actor, { action: "update", entity: "quotation", entityId: id, summary: `Quotation ${q.number} marked ${status}` });
  return { id };
}

export async function deleteQuotation(db: DbOrTx, actor: Actor | null, id: string) {
  const q = await loadQuotation(db, id);
  if (q.status === "converted") throw new AppError("Converted quotations can't be deleted");
  await db.delete(quotations).where(eq(quotations.id, id));
  await logAudit(db, actor, { action: "delete", entity: "quotation", entityId: id, summary: `Deleted quotation ${q.number}` });
  return { id };
}

/** Turn a quotation into a draft sales order or a draft invoice and mark it converted. */
export async function convertQuotation(db: DbOrTx, actor: Actor | null, id: string, target: "order" | "invoice", opts: SaleOptions = {}) {
  const q = await loadQuotation(db, id);
  if (q.status === "converted" || q.status === "rejected") throw new AppError(`Quotation ${q.number} is ${q.status}`);
  const qlines = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, id)).orderBy(asc(quotationLines.lineNo));
  const lines = qlines.map(toCalcLine);
  const date = today();
  let result: { id: string; number: string };
  if (target === "order") {
    if (!q.customerId) throw new AppError("Sales orders need a registered customer. Edit the quotation and pick a customer first.");
    result = await saveOrder(
      db,
      actor,
      {
        date,
        deliveryDate: null,
        customerId: q.customerId,
        warehouseId: null,
        quotationId: q.id,
        notes: [q.notes, `From quotation ${q.number}`].filter(Boolean).join("\n"),
        lines,
        documentDiscount: q.documentDiscount,
        charges: q.shippingCharges,
        confirm: false,
      },
      opts
    );
  } else {
    result = await saveInvoice(
      db,
      actor,
      {
        date,
        dueDate: null,
        customerId: q.customerId,
        customerName: q.customerId ? null : q.customerName,
        customerPhone: null,
        warehouseId: await getDefaultWarehouseId(db),
        salesOrderId: null,
        salesperson: null,
        notes: [q.notes, `From quotation ${q.number}`].filter(Boolean).join("\n"),
        lines,
        documentDiscount: q.documentDiscount,
        charges: q.shippingCharges,
        post: false,
      },
      opts
    );
  }
  await db.update(quotations).set({ status: "converted" }).where(eq(quotations.id, id));
  await logAudit(db, actor, {
    action: "update",
    entity: "quotation",
    entityId: id,
    summary: `Converted quotation ${q.number} to ${target === "order" ? "sales order" : "invoice"} ${result.number}`,
  });
  return { id: result.id, number: result.number, target };
}
