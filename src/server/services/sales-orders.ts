import { and, asc, eq, ne } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { salesInvoices, salesOrderLines, salesOrders } from "@/db/schema";
import { calcLine } from "@/lib/doc-calc";
import { round2, round3 } from "@/lib/format";
import { AppError } from "../errors";
import { logAudit, type Actor } from "./audit";
import { nextNumber } from "./numbering";
import { assertWarehouse, buildSaleLines, getDefaultWarehouseId, resolveCustomer, saveInvoice, totalsFrom, type SaleOptions } from "./sales";
import type { OrderInput, OrderToInvoiceInput } from "./sales-schemas";

async function loadOrder(db: DbOrTx, id: string) {
  const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, id));
  if (!order) throw new AppError("Sales order not found");
  return order;
}

/** Create or update a draft sales order; input.confirm confirms it straight away. */
export async function saveOrder(db: DbOrTx, actor: Actor | null, input: OrderInput, opts: SaleOptions = {}) {
  const { customer } = await resolveCustomer(db, input.customerId);
  if (input.warehouseId) await assertWarehouse(db, input.warehouseId);
  const { calc, rows } = await buildSaleLines(db, input, { ...opts, priceLevel: customer?.priceLevel });
  const header = {
    date: input.date,
    deliveryDate: input.deliveryDate ?? null,
    customerId: customer!.id,
    warehouseId: input.warehouseId ?? null,
    notes: input.notes ?? null,
    status: input.confirm ? ("confirmed" as const) : ("draft" as const),
    ...totalsFrom(calc),
  };
  let id: string;
  let number: string;
  if (input.id) {
    const cur = await loadOrder(db, input.id);
    if (cur.status !== "draft") throw new AppError(`Order ${cur.number} is ${cur.status}; only drafts can be edited`);
    await db.update(salesOrders).set(header).where(eq(salesOrders.id, cur.id));
    await db.delete(salesOrderLines).where(eq(salesOrderLines.orderId, cur.id));
    id = cur.id;
    number = cur.number;
    await logAudit(db, actor, { action: "update", entity: "sales_order", entityId: id, summary: `Updated sales order ${number}` });
  } else {
    number = await nextNumber(db, "SO");
    const [row] = await db
      .insert(salesOrders)
      .values({ ...header, number, quotationId: input.quotationId ?? null, createdBy: actor?.id ?? null })
      .returning();
    id = row.id;
    await logAudit(db, actor, { action: "create", entity: "sales_order", entityId: id, summary: `Created sales order ${number} for ${customer!.name}` });
  }
  await db.insert(salesOrderLines).values(rows.map((r) => ({ ...r, orderId: id, invoicedQty: 0 })));
  return { id, number };
}

export async function confirmOrder(db: DbOrTx, actor: Actor | null, id: string) {
  const order = await loadOrder(db, id);
  if (order.status !== "draft") throw new AppError(`Order ${order.number} is already ${order.status}`);
  await db.update(salesOrders).set({ status: "confirmed" }).where(eq(salesOrders.id, id));
  await logAudit(db, actor, { action: "post", entity: "sales_order", entityId: id, summary: `Confirmed sales order ${order.number}` });
  return { id };
}

export async function cancelOrder(db: DbOrTx, actor: Actor | null, id: string, reason?: string | null) {
  const order = await loadOrder(db, id);
  if (order.status === "fulfilled" || order.status === "cancelled") throw new AppError(`Order ${order.number} is ${order.status} and can't be cancelled`);
  await db.update(salesOrders).set({ status: "cancelled" }).where(eq(salesOrders.id, id));
  await logAudit(db, actor, {
    action: "void",
    entity: "sales_order",
    entityId: id,
    summary: `Cancelled sales order ${order.number}${reason ? `: ${reason}` : ""}`,
  });
  return { id };
}

export async function deleteDraftOrder(db: DbOrTx, actor: Actor | null, id: string) {
  const order = await loadOrder(db, id);
  if (order.status !== "draft") throw new AppError("Only draft orders can be deleted; cancel confirmed ones instead");
  await db.delete(salesOrders).where(eq(salesOrders.id, id));
  await logAudit(db, actor, { action: "delete", entity: "sales_order", entityId: id, summary: `Deleted draft order ${order.number}` });
  return { id };
}

/**
 * Create a draft invoice for some or all of what's left on a confirmed order. The bill discount is
 * shared pro rata; delivery charges go on the first invoice only. invoicedQty moves when the
 * invoice is posted.
 */
export async function createInvoiceFromOrder(db: DbOrTx, actor: Actor | null, input: OrderToInvoiceInput, opts: SaleOptions = {}) {
  const order = await loadOrder(db, input.orderId);
  if (order.status !== "confirmed" && order.status !== "partial") {
    throw new AppError(`Order ${order.number} is ${order.status}; only confirmed orders can be invoiced`);
  }
  const olines = await db.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, order.id)).orderBy(asc(salesOrderLines.lineNo));
  const byId = new Map(olines.map((l) => [l.id, l]));
  const picked = input.lines.filter((l) => l.qty > 0);
  if (!picked.length) throw new AppError("Enter a quantity to invoice on at least one line");

  const lines = picked.map((p) => {
    const o = byId.get(p.orderLineId);
    if (!o) throw new AppError("Order line not found");
    const remaining = round3(o.qty - o.invoicedQty);
    if (p.qty > remaining + 0.0005) throw new AppError(`"${o.description}": only ${remaining} left to invoice`);
    return { productId: o.productId, description: o.description, qty: round3(p.qty), price: o.unitPrice, discountPct: o.discountPct, taxRate: o.taxRate };
  });

  const netOf = (l: { qty: number; price: number; discountPct: number }) => calcLine({ qty: l.qty, price: l.price, discountPct: l.discountPct }).net;
  const orderNet = olines.reduce((s, l) => s + netOf({ qty: l.qty, price: l.unitPrice, discountPct: l.discountPct }), 0);
  const pickedNet = lines.reduce((s, l) => s + netOf(l), 0);
  const documentDiscount = orderNet > 0 ? round2((order.documentDiscount * pickedNet) / orderNet) : 0;

  const prior = await db
    .select({ id: salesInvoices.id })
    .from(salesInvoices)
    .where(and(eq(salesInvoices.salesOrderId, order.id), ne(salesInvoices.status, "void")));
  const charges = prior.length ? 0 : order.shippingCharges;

  const warehouseId = input.warehouseId ?? order.warehouseId ?? (await getDefaultWarehouseId(db));
  return saveInvoice(
    db,
    actor,
    {
      date: input.date,
      dueDate: null,
      customerId: order.customerId,
      customerName: null,
      customerPhone: null,
      warehouseId,
      salesOrderId: order.id,
      salesperson: null,
      notes: `From sales order ${order.number}`,
      lines,
      documentDiscount,
      charges,
      post: false,
    },
    opts
  );
}
