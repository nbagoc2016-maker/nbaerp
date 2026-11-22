import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { batches, products, stockBalances, stockMovements, STOCK_SOURCES } from "@/db/schema";
import { round2, round3 } from "@/lib/format";
import { AppError } from "../errors";
import type { Actor } from "./audit";

export type StockSource = (typeof STOCK_SOURCES)[number];

const LAST_COST_SOURCES = new Set<StockSource>(["opening", "goods_receipt", "supplier_bill"]);

export interface MoveStockInput {
  date: string;
  productId: string;
  warehouseId: string;
  /** Signed: positive receives stock, negative issues it */
  qty: number;
  /** Required for receipts. Ignored for issues, which always leave at the moving-average cost. */
  unitCost?: number;
  batchId?: string | null;
  sourceType: StockSource;
  sourceId?: string | null;
  sourceNumber?: string | null;
  notes?: string | null;
  allowNegative?: boolean;
  /**
   * Issue at exactly `unitCost` instead of the moving average (used when undoing a receipt, so the
   * stock value removed matches the value the reversed journal takes out of Inventory).
   */
  issueAtCost?: boolean;
}

export interface MoveStockResult {
  unitCost: number;
  value: number; // signed qty * unitCost
  balanceQty: number;
}

export async function getBalance(db: DbOrTx, productId: string, warehouseId: string) {
  const [row] = await db
    .select()
    .from(stockBalances)
    .where(and(eq(stockBalances.productId, productId), eq(stockBalances.warehouseId, warehouseId)));
  return row ?? { productId, warehouseId, qty: 0, avgCost: 0, reservedQty: 0 };
}

/**
 * The only way stock changes. Writes an immutable movement and keeps stock_balances (qty and
 * moving-average cost) in step. Returns the cost used, so callers can post COGS / inventory value.
 */
export async function moveStock(db: DbOrTx, actor: Actor | null, input: MoveStockInput): Promise<MoveStockResult> {
  const qty = round3(input.qty);
  if (qty === 0) throw new AppError("Stock movement quantity can't be zero");

  const [product] = await db.select().from(products).where(eq(products.id, input.productId));
  if (!product) throw new AppError("Product not found");
  if (product.type !== "stock") {
    return { unitCost: 0, value: 0, balanceQty: 0 }; // services don't carry stock
  }

  // Lock the balance row for this product/warehouse so concurrent postings queue up
  await db
    .insert(stockBalances)
    .values({ productId: input.productId, warehouseId: input.warehouseId, qty: 0, avgCost: 0 })
    .onConflictDoNothing();
  const locked = (await db.execute<{ qty: string; avg_cost: string }>(
    sql`select qty, avg_cost from stock_balances where product_id = ${input.productId} and warehouse_id = ${input.warehouseId} for update`
  )) as unknown as { qty: string; avg_cost: string }[] | { rows: { qty: string; avg_cost: string }[] };
  const row = Array.isArray(locked) ? locked[0] : locked.rows[0];
  const current = { qty: Number(row.qty), avgCost: Number(row.avg_cost) };

  let unitCost: number;
  let newQty = round3(current.qty + qty);
  let newAvg = current.avgCost;

  if (qty > 0) {
    unitCost = round2(input.unitCost ?? current.avgCost);
    // Moving average; if we were negative, the new receipt's cost becomes the average
    newAvg = current.qty > 0 ? round2((current.qty * current.avgCost + qty * unitCost) / newQty) : unitCost;
  } else {
    if (!input.allowNegative && newQty < -0.0005) {
      throw new AppError(
        `Not enough stock of "${product.name}": ${current.qty} on hand, trying to take ${Math.abs(qty)}`
      );
    }
    if (input.issueAtCost && input.unitCost !== undefined) {
      unitCost = round2(input.unitCost);
      // Re-average what stays behind so on-hand value = old value - value removed
      const remainingValue = current.qty * current.avgCost + qty * unitCost;
      newAvg = newQty > 0.0005 ? Math.max(round2(remainingValue / newQty), 0) : current.avgCost;
    } else {
      unitCost = current.avgCost || round2(product.costPrice);
    }
  }
  if (newQty === 0) newQty = 0;

  if (input.batchId) {
    const [batch] = await db.select().from(batches).where(eq(batches.id, input.batchId));
    if (!batch) throw new AppError("Roll / batch not found");
    const batchQty = round3(batch.qty + qty);
    if (batchQty < -0.0005) throw new AppError(`Roll ${batch.batchNo} only has ${batch.qty} left`);
    await db.update(batches).set({ qty: batchQty }).where(eq(batches.id, batch.id));
  }

  await db
    .update(stockBalances)
    .set({ qty: newQty, avgCost: newAvg })
    .where(and(eq(stockBalances.productId, input.productId), eq(stockBalances.warehouseId, input.warehouseId)));

  const value = round2(qty * unitCost);
  await db.insert(stockMovements).values({
    date: input.date,
    productId: input.productId,
    warehouseId: input.warehouseId,
    batchId: input.batchId ?? null,
    qty,
    unitCost,
    value,
    balanceQty: newQty,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    sourceNumber: input.sourceNumber ?? null,
    notes: input.notes ?? null,
    createdBy: actor?.id ?? null,
  });

  // "Last purchase cost" only follows genuine purchases (and opening stock), not internal
  // moves like transfers, adjustments, counts or void reversals
  if (qty > 0 && input.unitCost !== undefined && LAST_COST_SOURCES.has(input.sourceType)) {
    await db.update(products).set({ costPrice: unitCost }).where(eq(products.id, input.productId));
  }

  return { unitCost, value, balanceQty: newQty };
}

/** Create a roll / lot record for an incoming batch-tracked product (qty starts at 0; moveStock fills it). */
export async function createBatch(
  db: DbOrTx,
  input: { productId: string; warehouseId: string; batchNo: string; qty: number; unitCost: number; receivedDate: string; shade?: string | null; notes?: string | null }
) {
  const [batch] = await db
    .insert(batches)
    .values({
      productId: input.productId,
      warehouseId: input.warehouseId,
      batchNo: input.batchNo,
      initialQty: round3(input.qty),
      qty: 0,
      unitCost: input.unitCost,
      receivedDate: input.receivedDate,
      shade: input.shade ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return batch;
}

/** Undo every stock movement written by a document (used when a posted document is voided). */
export async function reverseStockForSource(
  db: DbOrTx,
  actor: Actor | null,
  sourceType: StockSource,
  sourceId: string,
  date: string
) {
  const moves = await db
    .select()
    .from(stockMovements)
    .where(and(eq(stockMovements.sourceType, sourceType), eq(stockMovements.sourceId, sourceId)));
  let value = 0;
  for (const m of moves) {
    const res = await moveStock(db, actor, {
      date,
      productId: m.productId,
      warehouseId: m.warehouseId,
      qty: -m.qty,
      unitCost: m.unitCost,
      batchId: m.batchId,
      sourceType: "adjustment",
      sourceId,
      sourceNumber: m.sourceNumber ? `${m.sourceNumber} (void)` : "void",
      notes: "Reversal of voided document",
      allowNegative: true,
      // Take received stock back out at the cost it came in at
      issueAtCost: m.qty > 0,
    });
    value = round2(value + res.value);
  }
  return value;
}
