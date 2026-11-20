// Inventory documents: stock transfers, stock adjustments and physical stock counts.
// Stock only changes through moveStock(); GL through postJournal()/voidJournal().
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  batches,
  products,
  stockAdjustmentLines,
  stockAdjustments,
  stockBalances,
  stockCountLines,
  stockCounts,
  stockTransferLines,
  stockTransfers,
  warehouses,
} from "@/db/schema";
import { round2, round3 } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal, type JournalLineInput } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import type { AdjustmentInput, CountCreateInput, CountLinesInput, TransferInput } from "./inventory-schemas";
import { nextNumber } from "./numbering";
import { getBalance, moveStock, reverseStockForSource, type MoveStockInput, type StockSource } from "./stock";

// ---- helpers ---------------------------------------------------------------------------------

async function getWarehouse(db: DbOrTx, id: string) {
  const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, id));
  if (!wh) throw new AppError("Warehouse not found");
  return wh;
}

async function loadProducts(db: DbOrTx, ids: string[]) {
  const rows = ids.length ? await db.select().from(products).where(inArray(products.id, [...new Set(ids)])) : [];
  const map = new Map(rows.map((p) => [p.id, p]));
  for (const id of ids) if (!map.has(id)) throw new AppError("A product on this document no longer exists");
  return map;
}

/**
 * Receive stock at a given cost without touching the product's "last purchase cost"
 * (moveStock updates it for every costed receipt; only purchases should).
 */
async function receiveKeepingCost(db: DbOrTx, actor: Actor | null, input: MoveStockInput) {
  const [p] = await db.select({ costPrice: products.costPrice }).from(products).where(eq(products.id, input.productId));
  const res = await moveStock(db, actor, input);
  if (p) await db.update(products).set({ costPrice: p.costPrice }).where(eq(products.id, input.productId));
  return res;
}

/** Reverse a document's movements; restores the products' last purchase cost afterwards. */
async function reverseKeepingCost(db: DbOrTx, actor: Actor | null, sourceType: StockSource, sourceId: string, date: string, productIds: string[]) {
  const before = productIds.length
    ? await db.select({ id: products.id, costPrice: products.costPrice }).from(products).where(inArray(products.id, [...new Set(productIds)]))
    : [];
  const value = await reverseStockForSource(db, actor, sourceType, sourceId, date);
  for (const p of before) await db.update(products).set({ costPrice: p.costPrice }).where(eq(products.id, p.id));
  return value;
}

/** Before un-receiving stock, make sure it is still there (it may have been sold since). */
async function assertAvailable(db: DbOrTx, warehouseId: string, need: Map<string, number>, names: Map<string, string>) {
  for (const [productId, qty] of need) {
    if (qty <= 0) continue;
    const bal = await getBalance(db, productId, warehouseId);
    if (bal.qty + 0.0005 < qty) {
      throw new AppError(`Can't void: only ${round3(bal.qty)} of "${names.get(productId) ?? "a product"}" is left where this stock went, ${round3(qty)} needed`);
    }
  }
}

/** Dr/Cr lines for stock gains (+) and losses (−) against Inventory Adjustments 5200. */
function adjustmentJournalLines(gain: number, loss: number, memo: string): JournalLineInput[] {
  return [
    { account: ACC.INVENTORY, debit: gain, memo },
    { account: ACC.INVENTORY_ADJUSTMENT, credit: gain, memo },
    { account: ACC.INVENTORY_ADJUSTMENT, debit: loss, memo },
    { account: ACC.INVENTORY, credit: loss, memo },
  ];
}

// ---- Stock transfers -------------------------------------------------------------------------

async function validateTransfer(db: DbOrTx, input: TransferInput) {
  if (input.fromWarehouseId === input.toWarehouseId) throw new AppError("Choose two different warehouses", { toWarehouseId: "Same as the source" });
  const from = await getWarehouse(db, input.fromWarehouseId);
  const to = await getWarehouse(db, input.toWarehouseId);
  if (!from.isActive || !to.isActive) throw new AppError("Both warehouses must be active");
  const prods = await loadProducts(db, input.lines.map((l) => l.productId));
  for (const l of input.lines) {
    const p = prods.get(l.productId)!;
    if (p.type !== "stock") throw new AppError(`"${p.name}" is a service and has no stock to transfer`);
    if (l.batchId) {
      const [b] = await db.select().from(batches).where(eq(batches.id, l.batchId));
      if (!b || b.productId !== p.id || b.warehouseId !== from.id) throw new AppError(`The roll chosen for "${p.name}" isn't in ${from.name}`);
    }
  }
}

export async function saveTransfer(db: DbOrTx, actor: Actor | null, input: TransferInput) {
  await validateTransfer(db, input);
  let id = input.id;
  if (id) {
    const [t] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
    if (!t) throw new AppError("Transfer not found");
    if (t.status !== "draft") throw new AppError("Only draft transfers can be edited");
    await db
      .update(stockTransfers)
      .set({ date: input.date, fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, notes: input.notes })
      .where(eq(stockTransfers.id, id));
    await db.delete(stockTransferLines).where(eq(stockTransferLines.transferId, id));
    await logAudit(db, actor, { action: "update", entity: "stock_transfer", entityId: id, summary: `Updated transfer ${t.number}` });
  } else {
    const number = await nextNumber(db, "TRF");
    const [t] = await db
      .insert(stockTransfers)
      .values({ number, date: input.date, fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, notes: input.notes, createdBy: actor?.id ?? null })
      .returning();
    id = t.id;
    await logAudit(db, actor, { action: "create", entity: "stock_transfer", entityId: id, summary: `Created transfer ${number}` });
  }
  await db.insert(stockTransferLines).values(input.lines.map((l) => ({ transferId: id!, productId: l.productId, batchId: l.batchId, qty: round3(l.qty) })));
  return { id };
}

/**
 * Post a transfer: each line leaves the source at its moving-average cost and arrives in the
 * destination at that same cost, so total quantity and value are unchanged. Rolls keep their
 * number: the destination gets (or reuses) a batch with the same batch no. No GL entry.
 */
export async function postTransfer(db: DbOrTx, actor: Actor | null, id: string) {
  const [t] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
  if (!t) throw new AppError("Transfer not found");
  if (t.status !== "draft") throw new AppError("This transfer has already been posted or voided");
  const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
  if (!lines.length) throw new AppError("This transfer has no items");
  await validateTransfer(db, { id, date: t.date, fromWarehouseId: t.fromWarehouseId, toWarehouseId: t.toWarehouseId, notes: t.notes, lines });

  const base = { date: t.date, sourceId: t.id, sourceNumber: t.number };
  for (const l of lines) {
    const out = await moveStock(db, actor, { ...base, productId: l.productId, warehouseId: t.fromWarehouseId, qty: -l.qty, batchId: l.batchId, sourceType: "transfer_out" });

    let destBatchId: string | null = null;
    if (l.batchId) {
      const [src] = await db.select().from(batches).where(eq(batches.id, l.batchId));
      const [existing] = await db
        .select()
        .from(batches)
        .where(and(eq(batches.productId, l.productId), eq(batches.warehouseId, t.toWarehouseId), eq(batches.batchNo, src.batchNo)));
      if (existing) {
        destBatchId = existing.id;
        await db
          .update(batches)
          .set({ initialQty: Math.max(existing.initialQty, round3(existing.qty + l.qty)) })
          .where(eq(batches.id, existing.id));
      } else {
        const [b] = await db
          .insert(batches)
          .values({
            productId: l.productId,
            warehouseId: t.toWarehouseId,
            batchNo: src.batchNo,
            initialQty: round3(l.qty),
            qty: 0,
            unitCost: src.unitCost,
            receivedDate: src.receivedDate ?? t.date,
            expiryDate: src.expiryDate,
            shade: src.shade,
            notes: `Transferred in on ${t.number}`,
          })
          .returning();
        destBatchId = b.id;
      }
    }

    await receiveKeepingCost(db, actor, {
      ...base,
      productId: l.productId,
      warehouseId: t.toWarehouseId,
      qty: l.qty,
      unitCost: out.unitCost,
      batchId: destBatchId,
      sourceType: "transfer_in",
    });
  }

  await db.update(stockTransfers).set({ status: "posted" }).where(eq(stockTransfers.id, id));
  await logAudit(db, actor, { action: "post", entity: "stock_transfer", entityId: id, summary: `Posted transfer ${t.number} (${lines.length} item${lines.length === 1 ? "" : "s"})` });
  return { id };
}

export async function voidTransfer(db: DbOrTx, actor: Actor | null, id: string, reason?: string | null) {
  const [t] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
  if (!t) throw new AppError("Transfer not found");
  if (t.status === "void") throw new AppError("This transfer is already void");
  if (t.status === "posted") {
    const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
    const prods = await loadProducts(db, lines.map((l) => l.productId));
    const need = new Map<string, number>();
    for (const l of lines) need.set(l.productId, round3((need.get(l.productId) ?? 0) + l.qty));
    await assertAvailable(db, t.toWarehouseId, need, new Map([...prods].map(([k, p]) => [k, p.name])));
    // Take it back out of the destination first, then return it to the source
    await reverseKeepingCost(db, actor, "transfer_in", t.id, t.date, [...need.keys()]);
    await reverseKeepingCost(db, actor, "transfer_out", t.id, t.date, [...need.keys()]);
  }
  await db.update(stockTransfers).set({ status: "void" }).where(eq(stockTransfers.id, id));
  await logAudit(db, actor, { action: "void", entity: "stock_transfer", entityId: id, summary: `Voided transfer ${t.number}${reason ? `: ${reason}` : ""}` });
  return { id };
}

export async function deleteTransfer(db: DbOrTx, actor: Actor | null, id: string) {
  const [t] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
  if (!t) throw new AppError("Transfer not found");
  if (t.status !== "draft") throw new AppError("Only drafts can be deleted; void a posted transfer instead");
  await db.delete(stockTransfers).where(eq(stockTransfers.id, id));
  await logAudit(db, actor, { action: "delete", entity: "stock_transfer", entityId: id, summary: `Deleted draft transfer ${t.number}` });
  return { id };
}

// ---- Stock adjustments -----------------------------------------------------------------------

async function validateAdjustment(db: DbOrTx, input: AdjustmentInput) {
  const wh = await getWarehouse(db, input.warehouseId);
  const prods = await loadProducts(db, input.lines.map((l) => l.productId));
  for (const l of input.lines) {
    const p = prods.get(l.productId)!;
    if (p.type !== "stock") throw new AppError(`"${p.name}" is a service and has no stock to adjust`);
    if (l.batchId) {
      const [b] = await db.select().from(batches).where(eq(batches.id, l.batchId));
      if (!b || b.productId !== p.id || b.warehouseId !== wh.id) throw new AppError(`The roll chosen for "${p.name}" isn't in ${wh.name}`);
    }
  }
  return { wh, prods };
}

export async function saveAdjustment(db: DbOrTx, actor: Actor | null, input: AdjustmentInput) {
  await validateAdjustment(db, input);
  let id = input.id;
  if (id) {
    const [a] = await db.select().from(stockAdjustments).where(eq(stockAdjustments.id, id));
    if (!a) throw new AppError("Adjustment not found");
    if (a.status !== "draft") throw new AppError("Only draft adjustments can be edited");
    await db.update(stockAdjustments).set({ date: input.date, warehouseId: input.warehouseId, reason: input.reason, notes: input.notes }).where(eq(stockAdjustments.id, id));
    await db.delete(stockAdjustmentLines).where(eq(stockAdjustmentLines.adjustmentId, id));
    await logAudit(db, actor, { action: "update", entity: "stock_adjustment", entityId: id, summary: `Updated adjustment ${a.number}` });
  } else {
    const number = await nextNumber(db, "ADJ");
    const [a] = await db
      .insert(stockAdjustments)
      .values({ number, date: input.date, warehouseId: input.warehouseId, reason: input.reason, notes: input.notes, createdBy: actor?.id ?? null })
      .returning();
    id = a.id;
    await logAudit(db, actor, { action: "create", entity: "stock_adjustment", entityId: id, summary: `Created adjustment ${number}` });
  }
  await db.insert(stockAdjustmentLines).values(
    input.lines.map((l) => ({ adjustmentId: id!, productId: l.productId, batchId: l.batchId, qtyChange: round3(l.qtyChange), unitCost: round2(l.unitCost), notes: l.notes }))
  );
  return { id };
}

/**
 * Post an adjustment: increases come in at the line cost (default: current average cost) and
 * book Dr Inventory / Cr 5200; decreases leave at average cost and book Dr 5200 / Cr Inventory.
 */
export async function postAdjustment(db: DbOrTx, actor: Actor | null, id: string) {
  const [a] = await db.select().from(stockAdjustments).where(eq(stockAdjustments.id, id));
  if (!a) throw new AppError("Adjustment not found");
  if (a.status !== "draft") throw new AppError("This adjustment has already been posted or voided");
  const lines = await db.select().from(stockAdjustmentLines).where(eq(stockAdjustmentLines.adjustmentId, id));
  if (!lines.length) throw new AppError("This adjustment has no items");
  const { prods } = await validateAdjustment(db, {
    id,
    date: a.date,
    warehouseId: a.warehouseId,
    reason: a.reason,
    notes: a.notes,
    lines,
  });

  let gain = 0;
  let loss = 0;
  const base = { date: a.date, warehouseId: a.warehouseId, sourceType: "adjustment" as const, sourceId: a.id, sourceNumber: a.number };
  for (const l of lines) {
    let used: number;
    if (l.qtyChange > 0) {
      const bal = await getBalance(db, l.productId, a.warehouseId);
      const cost = round2(l.unitCost > 0 ? l.unitCost : bal.avgCost || prods.get(l.productId)!.costPrice);
      const res = await receiveKeepingCost(db, actor, { ...base, productId: l.productId, qty: l.qtyChange, unitCost: cost, batchId: l.batchId, notes: l.notes });
      used = res.unitCost;
      gain = round2(gain + res.value);
    } else {
      const res = await moveStock(db, actor, { ...base, productId: l.productId, qty: l.qtyChange, batchId: l.batchId, notes: l.notes });
      used = res.unitCost;
      loss = round2(loss - res.value);
    }
    await db.update(stockAdjustmentLines).set({ unitCost: used }).where(eq(stockAdjustmentLines.id, l.id));
  }

  let journalEntryId: string | null = null;
  if (gain > 0 || loss > 0) {
    const entry = await postJournal(db, actor, {
      date: a.date,
      memo: `Stock adjustment ${a.number} (${a.reason})`,
      sourceType: "stock_adjustment",
      sourceId: a.id,
      sourceNumber: a.number,
      lines: adjustmentJournalLines(gain, loss, a.reason),
    });
    journalEntryId = entry.id;
  }
  const totalValue = round2(gain - loss);
  await db.update(stockAdjustments).set({ status: "posted", totalValue, journalEntryId }).where(eq(stockAdjustments.id, id));
  await logAudit(db, actor, { action: "post", entity: "stock_adjustment", entityId: id, summary: `Posted adjustment ${a.number}, net value ${totalValue}` });
  return { id, gain, loss, totalValue };
}

export async function voidAdjustment(db: DbOrTx, actor: Actor | null, id: string, reason?: string | null) {
  const [a] = await db.select().from(stockAdjustments).where(eq(stockAdjustments.id, id));
  if (!a) throw new AppError("Adjustment not found");
  if (a.status === "void") throw new AppError("This adjustment is already void");
  if (a.status === "posted") {
    const lines = await db.select().from(stockAdjustmentLines).where(eq(stockAdjustmentLines.adjustmentId, id));
    const prods = await loadProducts(db, lines.map((l) => l.productId));
    const need = new Map<string, number>();
    for (const l of lines) need.set(l.productId, round3((need.get(l.productId) ?? 0) + l.qtyChange));
    await assertAvailable(db, a.warehouseId, need, new Map([...prods].map(([k, p]) => [k, p.name])));
    await reverseKeepingCost(db, actor, "adjustment", a.id, a.date, [...need.keys()]);
    await voidJournal(db, actor, a.journalEntryId, `Adjustment ${a.number} voided`);
  }
  await db.update(stockAdjustments).set({ status: "void" }).where(eq(stockAdjustments.id, id));
  await logAudit(db, actor, { action: "void", entity: "stock_adjustment", entityId: id, summary: `Voided adjustment ${a.number}${reason ? `: ${reason}` : ""}` });
  return { id };
}

export async function deleteAdjustment(db: DbOrTx, actor: Actor | null, id: string) {
  const [a] = await db.select().from(stockAdjustments).where(eq(stockAdjustments.id, id));
  if (!a) throw new AppError("Adjustment not found");
  if (a.status !== "draft") throw new AppError("Only drafts can be deleted; void a posted adjustment instead");
  await db.delete(stockAdjustments).where(eq(stockAdjustments.id, id));
  await logAudit(db, actor, { action: "delete", entity: "stock_adjustment", entityId: id, summary: `Deleted draft adjustment ${a.number}` });
  return { id };
}

// ---- Stock counts ----------------------------------------------------------------------------

/**
 * Start a stock take: snapshot every stock product (optionally one category) with its current
 * system quantity and average cost in the warehouse. Status "counting" until posted.
 */
export async function createCount(db: DbOrTx, actor: Actor | null, input: CountCreateInput) {
  const wh = await getWarehouse(db, input.warehouseId);
  const open = await db
    .select({ number: stockCounts.number })
    .from(stockCounts)
    .where(and(eq(stockCounts.warehouseId, wh.id), eq(stockCounts.status, "counting")));
  if (open.length) throw new AppError(`Count ${open[0].number} is still in progress for ${wh.name}. Post or void it first.`);

  const rows = await db
    .select({
      id: products.id,
      costPrice: products.costPrice,
      qty: sql<number>`coalesce(${stockBalances.qty}, 0)`.mapWith(Number),
      avgCost: sql<number>`coalesce(${stockBalances.avgCost}, 0)`.mapWith(Number),
    })
    .from(products)
    .leftJoin(stockBalances, and(eq(stockBalances.productId, products.id), eq(stockBalances.warehouseId, wh.id)))
    .where(
      and(
        eq(products.type, "stock"),
        // inactive products are included only while they still hold stock here
        or(eq(products.isActive, true), sql`coalesce(${stockBalances.qty}, 0) <> 0`),
        input.categoryId ? eq(products.categoryId, input.categoryId) : undefined
      )
    )
    .orderBy(asc(products.name));
  if (!rows.length) throw new AppError("There are no stock products to count");

  const number = await nextNumber(db, "CNT");
  const [c] = await db
    .insert(stockCounts)
    .values({ number, date: input.date, warehouseId: wh.id, status: "counting", notes: input.notes, createdBy: actor?.id ?? null })
    .returning();
  await db.insert(stockCountLines).values(
    rows.map((r) => ({ countId: c.id, productId: r.id, systemQty: round3(r.qty), countedQty: null, unitCost: round2(r.avgCost || r.costPrice) }))
  );
  await logAudit(db, actor, { action: "create", entity: "stock_count", entityId: c.id, summary: `Started stock count ${number} for ${wh.name} (${rows.length} items)` });
  return { id: c.id };
}

export async function saveCountLines(db: DbOrTx, actor: Actor | null, input: CountLinesInput) {
  const [c] = await db.select().from(stockCounts).where(eq(stockCounts.id, input.id));
  if (!c) throw new AppError("Stock count not found");
  if (c.status !== "counting" && c.status !== "draft") throw new AppError("This count is closed");
  for (const l of input.lines) {
    await db
      .update(stockCountLines)
      .set({ countedQty: l.countedQty === null ? null : round3(l.countedQty) })
      .where(and(eq(stockCountLines.id, l.lineId), eq(stockCountLines.countId, c.id)));
  }
  return { id: c.id };
}

/**
 * Post a count: every counted line whose quantity differs from the snapshot is adjusted
 * (sourceType "stock_count"), and the net gain/loss goes to the GL in one entry.
 * Uncounted lines are left untouched.
 */
export async function postCount(db: DbOrTx, actor: Actor | null, id: string) {
  const [c] = await db.select().from(stockCounts).where(eq(stockCounts.id, id));
  if (!c) throw new AppError("Stock count not found");
  if (c.status !== "counting" && c.status !== "draft") throw new AppError("This count has already been posted or voided");
  const lines = await db.select().from(stockCountLines).where(eq(stockCountLines.countId, id));
  const counted = lines.filter((l) => l.countedQty !== null);
  if (!counted.length) throw new AppError("Enter at least one counted quantity before posting");

  let gain = 0;
  let loss = 0;
  let adjusted = 0;
  const base = { date: c.date, warehouseId: c.warehouseId, sourceType: "stock_count" as const, sourceId: c.id, sourceNumber: c.number };
  for (const l of counted) {
    const diff = round3(l.countedQty! - l.systemQty);
    if (diff === 0) continue;
    adjusted++;
    if (diff > 0) {
      const res = await receiveKeepingCost(db, actor, { ...base, productId: l.productId, qty: diff, unitCost: l.unitCost, notes: "Count surplus" });
      gain = round2(gain + res.value);
    } else {
      const res = await moveStock(db, actor, { ...base, productId: l.productId, qty: diff, notes: "Count shortage" });
      loss = round2(loss - res.value);
    }
  }

  let journalEntryId: string | null = null;
  if (gain > 0 || loss > 0) {
    const entry = await postJournal(db, actor, {
      date: c.date,
      memo: `Stock count ${c.number}`,
      sourceType: "stock_count",
      sourceId: c.id,
      sourceNumber: c.number,
      lines: adjustmentJournalLines(gain, loss, "stock count"),
    });
    journalEntryId = entry.id;
  }
  await db.update(stockCounts).set({ status: "posted", journalEntryId }).where(eq(stockCounts.id, id));
  await logAudit(db, actor, {
    action: "post",
    entity: "stock_count",
    entityId: id,
    summary: `Posted stock count ${c.number}: ${adjusted} item(s) adjusted, gain ${gain}, loss ${loss}`,
  });
  return { id, adjusted, gain, loss };
}

export async function voidCount(db: DbOrTx, actor: Actor | null, id: string, reason?: string | null) {
  const [c] = await db.select().from(stockCounts).where(eq(stockCounts.id, id));
  if (!c) throw new AppError("Stock count not found");
  if (c.status === "void") throw new AppError("This count is already void");
  if (c.status === "posted") {
    const lines = await db
      .select()
      .from(stockCountLines)
      .where(and(eq(stockCountLines.countId, id), sql`${stockCountLines.countedQty} is not null`));
    const prods = await loadProducts(db, lines.map((l) => l.productId));
    const need = new Map<string, number>();
    for (const l of lines) need.set(l.productId, round3(l.countedQty! - l.systemQty));
    await assertAvailable(db, c.warehouseId, need, new Map([...prods].map(([k, p]) => [k, p.name])));
    await reverseKeepingCost(db, actor, "stock_count", c.id, c.date, [...need.keys()]);
    await voidJournal(db, actor, c.journalEntryId, `Stock count ${c.number} voided`);
  }
  await db.update(stockCounts).set({ status: "void" }).where(eq(stockCounts.id, id));
  await logAudit(db, actor, { action: "void", entity: "stock_count", entityId: id, summary: `Voided stock count ${c.number}${reason ? `: ${reason}` : ""}` });
  return { id };
}
