import "server-only";
import { aliasedTable, and, asc, desc, eq, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { StockSource } from "@/server/services/stock";
import type { PickerData } from "@/components/inventory/stock-doc-forms";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---- Stock on hand ---------------------------------------------------------------------------

export async function activeWarehouses() {
  return db.select().from(s.warehouses).where(eq(s.warehouses.isActive, true)).orderBy(desc(s.warehouses.isDefault), asc(s.warehouses.name));
}

/** Stock products with per-warehouse quantities and average costs. */
export async function stockMatrix() {
  const [warehouses, prods, balances] = await Promise.all([
    activeWarehouses(),
    db
      .select({
        id: s.products.id,
        sku: s.products.sku,
        name: s.products.name,
        unit: s.units.code,
        category: s.productCategories.name,
        brand: s.brands.name,
        reorderLevel: s.products.reorderLevel,
        reorderQty: s.products.reorderQty,
        costPrice: s.products.costPrice,
        isActive: s.products.isActive,
      })
      .from(s.products)
      .innerJoin(s.units, eq(s.units.id, s.products.unitId))
      .leftJoin(s.productCategories, eq(s.productCategories.id, s.products.categoryId))
      .leftJoin(s.brands, eq(s.brands.id, s.products.brandId))
      .where(eq(s.products.type, "stock"))
      .orderBy(asc(s.products.name)),
    db.select().from(s.stockBalances),
  ]);
  const byProduct = new Map<string, Record<string, { qty: number; avgCost: number; reserved: number }>>();
  for (const b of balances) {
    const m = byProduct.get(b.productId) ?? {};
    m[b.warehouseId] = { qty: b.qty, avgCost: b.avgCost, reserved: b.reservedQty };
    byProduct.set(b.productId, m);
  }
  const rows = prods
    .map((p) => {
      const per = byProduct.get(p.id) ?? {};
      const qty = Object.values(per).reduce((t, v) => t + v.qty, 0);
      const value = Object.values(per).reduce((t, v) => t + v.qty * v.avgCost, 0);
      return { ...p, per, qty: r3(qty), value: r2(value), avgCost: qty > 0 ? r2(value / qty) : 0 };
    })
    // Inactive products only show while they still hold stock
    .filter((p) => p.isActive || Math.abs(p.qty) > 0.0005);
  return { warehouses: warehouses.map((w) => ({ id: w.id, name: w.name, code: w.code })), rows };
}

// ---- Batches ---------------------------------------------------------------------------------

export async function listBatches() {
  const rows = await db
    .select({
      id: s.batches.id,
      batchNo: s.batches.batchNo,
      shade: s.batches.shade,
      initialQty: s.batches.initialQty,
      qty: s.batches.qty,
      unitCost: s.batches.unitCost,
      receivedDate: s.batches.receivedDate,
      expiryDate: s.batches.expiryDate,
      productId: s.products.id,
      product: s.products.name,
      sku: s.products.sku,
      unit: s.units.code,
      warehouseId: s.warehouses.id,
      warehouse: s.warehouses.name,
    })
    .from(s.batches)
    .innerJoin(s.products, eq(s.products.id, s.batches.productId))
    .innerJoin(s.units, eq(s.units.id, s.products.unitId))
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.batches.warehouseId))
    .orderBy(desc(s.batches.receivedDate), asc(s.batches.batchNo));
  return rows;
}

// ---- Pickers for transfer / adjustment forms -------------------------------------------------

export async function stockPickerData() {
  const [prods, balances, openBatches] = await Promise.all([
    db
      .select({
        id: s.products.id,
        sku: s.products.sku,
        name: s.products.name,
        barcode: s.products.barcode,
        unit: s.units.code,
        allowFraction: s.units.allowFraction,
        trackBatches: s.products.trackBatches,
        costPrice: s.products.costPrice,
      })
      .from(s.products)
      .innerJoin(s.units, eq(s.units.id, s.products.unitId))
      .where(and(eq(s.products.type, "stock"), eq(s.products.isActive, true)))
      .orderBy(asc(s.products.name)),
    db.select().from(s.stockBalances),
    db.select().from(s.batches).where(sql`${s.batches.qty} > 0`).orderBy(asc(s.batches.batchNo)),
  ]);
  const balance: Record<string, Record<string, { qty: number; avgCost: number }>> = {};
  for (const b of balances) (balance[b.productId] ??= {})[b.warehouseId] = { qty: b.qty, avgCost: b.avgCost };
  return {
    products: prods,
    balance,
    batches: openBatches.map((b) => ({ id: b.id, productId: b.productId, warehouseId: b.warehouseId, batchNo: b.batchNo, qty: b.qty, shade: b.shade })),
  };
}
export type StockPickerData = Awaited<ReturnType<typeof stockPickerData>>;

/** Everything the transfer / adjustment forms need; average costs are dropped without cost access. */
export async function docFormData(canCost: boolean): Promise<PickerData> {
  const [d, whs] = await Promise.all([stockPickerData(), activeWarehouses()]);
  const balance: PickerData["balance"] = {};
  for (const [pid, per] of Object.entries(d.balance)) {
    balance[pid] = Object.fromEntries(Object.entries(per).map(([wid, b]) => [wid, { qty: b.qty, avgCost: canCost ? b.avgCost : null }]));
  }
  return {
    products: d.products.map(({ costPrice, ...p }) => {
      void costPrice;
      return p;
    }),
    balance,
    batches: d.batches,
    warehouses: whs.map((w) => ({ value: w.id, label: w.name, hint: w.code, isDefault: w.isDefault })),
  };
}

// ---- Transfers -------------------------------------------------------------------------------

const fromWh = aliasedTable(s.warehouses, "from_wh");
const toWh = aliasedTable(s.warehouses, "to_wh");

export async function listTransfers() {
  return db
    .select({
      id: s.stockTransfers.id,
      number: s.stockTransfers.number,
      date: s.stockTransfers.date,
      status: s.stockTransfers.status,
      notes: s.stockTransfers.notes,
      from: fromWh.name,
      to: toWh.name,
      lines: sql<number>`(select count(*) from stock_transfer_lines l where l.transfer_id = stock_transfers.id)`.mapWith(Number),
      qty: sql<number>`(select coalesce(sum(qty), 0) from stock_transfer_lines l where l.transfer_id = stock_transfers.id)`.mapWith(Number),
    })
    .from(s.stockTransfers)
    .innerJoin(fromWh, eq(fromWh.id, s.stockTransfers.fromWarehouseId))
    .innerJoin(toWh, eq(toWh.id, s.stockTransfers.toWarehouseId))
    .orderBy(desc(s.stockTransfers.date), desc(s.stockTransfers.number));
}

export async function getTransfer(id: string) {
  const [t] = await db
    .select({ doc: s.stockTransfers, from: fromWh.name, fromCode: fromWh.code, to: toWh.name, toCode: toWh.code, createdBy: s.users.name })
    .from(s.stockTransfers)
    .innerJoin(fromWh, eq(fromWh.id, s.stockTransfers.fromWarehouseId))
    .innerJoin(toWh, eq(toWh.id, s.stockTransfers.toWarehouseId))
    .leftJoin(s.users, eq(s.users.id, s.stockTransfers.createdBy))
    .where(eq(s.stockTransfers.id, id));
  if (!t) return null;
  const lines = await db
    .select({
      id: s.stockTransferLines.id,
      productId: s.stockTransferLines.productId,
      batchId: s.stockTransferLines.batchId,
      qty: s.stockTransferLines.qty,
      sku: s.products.sku,
      name: s.products.name,
      unit: s.units.code,
      batchNo: s.batches.batchNo,
      shade: s.batches.shade,
    })
    .from(s.stockTransferLines)
    .innerJoin(s.products, eq(s.products.id, s.stockTransferLines.productId))
    .innerJoin(s.units, eq(s.units.id, s.products.unitId))
    .leftJoin(s.batches, eq(s.batches.id, s.stockTransferLines.batchId))
    .where(eq(s.stockTransferLines.transferId, id));
  // Cost the goods moved at (from the outgoing movements, once posted)
  const moves = await db
    .select({ productId: s.stockMovements.productId, qty: s.stockMovements.qty, value: s.stockMovements.value })
    .from(s.stockMovements)
    .where(and(eq(s.stockMovements.sourceType, "transfer_out"), eq(s.stockMovements.sourceId, id)));
  const value = r2(-moves.reduce((t, m) => t + m.value, 0));
  return { ...t, lines, value };
}

// ---- Adjustments -----------------------------------------------------------------------------

export async function listAdjustments() {
  return db
    .select({
      id: s.stockAdjustments.id,
      number: s.stockAdjustments.number,
      date: s.stockAdjustments.date,
      status: s.stockAdjustments.status,
      reason: s.stockAdjustments.reason,
      warehouse: s.warehouses.name,
      totalValue: s.stockAdjustments.totalValue,
      notes: s.stockAdjustments.notes,
      lines: sql<number>`(select count(*) from stock_adjustment_lines l where l.adjustment_id = stock_adjustments.id)`.mapWith(Number),
    })
    .from(s.stockAdjustments)
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.stockAdjustments.warehouseId))
    .orderBy(desc(s.stockAdjustments.date), desc(s.stockAdjustments.number));
}

export async function getAdjustment(id: string) {
  const [a] = await db
    .select({ doc: s.stockAdjustments, warehouse: s.warehouses.name, createdBy: s.users.name, journalNumber: s.journalEntries.number })
    .from(s.stockAdjustments)
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.stockAdjustments.warehouseId))
    .leftJoin(s.users, eq(s.users.id, s.stockAdjustments.createdBy))
    .leftJoin(s.journalEntries, eq(s.journalEntries.id, s.stockAdjustments.journalEntryId))
    .where(eq(s.stockAdjustments.id, id));
  if (!a) return null;
  const lines = await db
    .select({
      id: s.stockAdjustmentLines.id,
      productId: s.stockAdjustmentLines.productId,
      batchId: s.stockAdjustmentLines.batchId,
      qtyChange: s.stockAdjustmentLines.qtyChange,
      unitCost: s.stockAdjustmentLines.unitCost,
      notes: s.stockAdjustmentLines.notes,
      sku: s.products.sku,
      name: s.products.name,
      unit: s.units.code,
      batchNo: s.batches.batchNo,
    })
    .from(s.stockAdjustmentLines)
    .innerJoin(s.products, eq(s.products.id, s.stockAdjustmentLines.productId))
    .innerJoin(s.units, eq(s.units.id, s.products.unitId))
    .leftJoin(s.batches, eq(s.batches.id, s.stockAdjustmentLines.batchId))
    .where(eq(s.stockAdjustmentLines.adjustmentId, id));
  return { ...a, lines };
}

// ---- Counts ----------------------------------------------------------------------------------

export async function listCounts() {
  return db
    .select({
      id: s.stockCounts.id,
      number: s.stockCounts.number,
      date: s.stockCounts.date,
      status: s.stockCounts.status,
      warehouse: s.warehouses.name,
      notes: s.stockCounts.notes,
      lines: sql<number>`(select count(*) from stock_count_lines l where l.count_id = stock_counts.id)`.mapWith(Number),
      counted: sql<number>`(select count(*) from stock_count_lines l where l.count_id = stock_counts.id and l.counted_qty is not null)`.mapWith(Number),
      variances: sql<number>`(select count(*) from stock_count_lines l where l.count_id = stock_counts.id and l.counted_qty is not null and l.counted_qty <> l.system_qty)`.mapWith(Number),
      varianceValue: sql<number>`(select coalesce(sum((l.counted_qty - l.system_qty) * l.unit_cost), 0) from stock_count_lines l where l.count_id = stock_counts.id and l.counted_qty is not null)`.mapWith(Number),
    })
    .from(s.stockCounts)
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.stockCounts.warehouseId))
    .orderBy(desc(s.stockCounts.date), desc(s.stockCounts.number));
}

export async function getCount(id: string) {
  const [c] = await db
    .select({ doc: s.stockCounts, warehouse: s.warehouses.name, createdBy: s.users.name, journalNumber: s.journalEntries.number })
    .from(s.stockCounts)
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.stockCounts.warehouseId))
    .leftJoin(s.users, eq(s.users.id, s.stockCounts.createdBy))
    .leftJoin(s.journalEntries, eq(s.journalEntries.id, s.stockCounts.journalEntryId))
    .where(eq(s.stockCounts.id, id));
  if (!c) return null;
  const lines = await db
    .select({
      id: s.stockCountLines.id,
      productId: s.stockCountLines.productId,
      systemQty: s.stockCountLines.systemQty,
      countedQty: s.stockCountLines.countedQty,
      unitCost: s.stockCountLines.unitCost,
      sku: s.products.sku,
      name: s.products.name,
      barcode: s.products.barcode,
      unit: s.units.code,
      allowFraction: s.units.allowFraction,
      category: s.productCategories.name,
    })
    .from(s.stockCountLines)
    .innerJoin(s.products, eq(s.products.id, s.stockCountLines.productId))
    .innerJoin(s.units, eq(s.units.id, s.products.unitId))
    .leftJoin(s.productCategories, eq(s.productCategories.id, s.products.categoryId))
    .where(eq(s.stockCountLines.countId, id))
    .orderBy(asc(s.productCategories.name), asc(s.products.name));
  return { ...c, lines };
}

// ---- Movements (stock ledger) ----------------------------------------------------------------

export interface MovementFilter {
  from: string;
  to: string;
  productId?: string | null;
  warehouseId?: string | null;
  sourceType?: StockSource | null;
}

/** Where a movement's source document lives, so the ledger can link to it. */
export type SourceKind = StockSource | "product" | "unknown";

const MOVEMENT_LIMIT = 3000;

export async function stockLedger(f: MovementFilter) {
  const where: SQL[] = [gte(s.stockMovements.date, f.from), lte(s.stockMovements.date, f.to)];
  if (f.productId) where.push(eq(s.stockMovements.productId, f.productId));
  if (f.warehouseId) where.push(eq(s.stockMovements.warehouseId, f.warehouseId));
  if (f.sourceType) where.push(eq(s.stockMovements.sourceType, f.sourceType));

  const rows = await db
    .select({
      id: s.stockMovements.id,
      date: s.stockMovements.date,
      createdAt: s.stockMovements.createdAt,
      productId: s.stockMovements.productId,
      product: s.products.name,
      sku: s.products.sku,
      unit: s.units.code,
      warehouseId: s.stockMovements.warehouseId,
      warehouse: s.warehouses.name,
      batchNo: s.batches.batchNo,
      qty: s.stockMovements.qty,
      unitCost: s.stockMovements.unitCost,
      value: s.stockMovements.value,
      balanceQty: s.stockMovements.balanceQty,
      sourceType: s.stockMovements.sourceType,
      sourceId: s.stockMovements.sourceId,
      sourceNumber: s.stockMovements.sourceNumber,
      notes: s.stockMovements.notes,
      user: s.users.name,
    })
    .from(s.stockMovements)
    .innerJoin(s.products, eq(s.products.id, s.stockMovements.productId))
    .innerJoin(s.units, eq(s.units.id, s.products.unitId))
    .innerJoin(s.warehouses, eq(s.warehouses.id, s.stockMovements.warehouseId))
    .leftJoin(s.batches, eq(s.batches.id, s.stockMovements.batchId))
    .leftJoin(s.users, eq(s.users.id, s.stockMovements.createdBy))
    .where(and(...where))
    .orderBy(asc(s.stockMovements.date), asc(s.stockMovements.createdAt))
    .limit(MOVEMENT_LIMIT + 1);
  const truncated = rows.length > MOVEMENT_LIMIT;
  if (truncated) rows.length = MOVEMENT_LIMIT;

  // Reversal movements carry sourceType "adjustment" with the voided document's id: find which
  // document that is so the link goes to the right place.
  const adjIds = [...new Set(rows.filter((r) => r.sourceType === "adjustment" && r.sourceId).map((r) => r.sourceId!))];
  const kindOf = new Map<string, SourceKind>();
  if (adjIds.length) {
    const tables: [SourceKind, PgTable, PgColumn][] = [
      ["adjustment", s.stockAdjustments, s.stockAdjustments.id],
      ["transfer_out", s.stockTransfers, s.stockTransfers.id],
      ["stock_count", s.stockCounts, s.stockCounts.id],
      ["sales_invoice", s.salesInvoices, s.salesInvoices.id],
      ["sales_return", s.salesReturns, s.salesReturns.id],
      ["goods_receipt", s.goodsReceipts, s.goodsReceipts.id],
      ["supplier_bill", s.supplierBills, s.supplierBills.id],
      ["purchase_return", s.purchaseReturns, s.purchaseReturns.id],
      ["product", s.products, s.products.id],
    ];
    for (const [kind, table, col] of tables) {
      const found = await db.select({ id: col }).from(table).where(inArray(col, adjIds));
      for (const r of found) {
        const id = String(r.id);
        if (!kindOf.has(id)) kindOf.set(id, kind);
      }
    }
  }

  // Running balance: per product+warehouse when filtered to one warehouse (or none), across all
  // warehouses when a product is chosen without a warehouse.
  const openingRows = f.productId
    ? await db
        .select({
          warehouseId: s.stockMovements.warehouseId,
          qty: sql<number>`coalesce(sum(${s.stockMovements.qty}), 0)`.mapWith(Number),
          value: sql<number>`coalesce(sum(${s.stockMovements.value}), 0)`.mapWith(Number),
        })
        .from(s.stockMovements)
        .where(
          and(
            eq(s.stockMovements.productId, f.productId),
            lt(s.stockMovements.date, f.from),
            f.warehouseId ? eq(s.stockMovements.warehouseId, f.warehouseId) : undefined
          )
        )
        .groupBy(s.stockMovements.warehouseId)
    : [];
  const opening = { qty: r3(openingRows.reduce((t, r) => t + r.qty, 0)), value: r2(openingRows.reduce((t, r) => t + r.value, 0)) };

  let running = opening.qty;
  const out = rows.map((r) => {
    running = r3(running + r.qty);
    const kind: SourceKind = r.sourceType === "adjustment" && r.sourceId ? (kindOf.get(r.sourceId) ?? "unknown") : r.sourceType === "opening" && r.sourceId ? "product" : r.sourceType;
    return { ...r, createdAt: r.createdAt.toISOString(), kind, running: f.productId ? running : r.balanceQty };
  });
  return { rows: out, opening, truncated, limit: MOVEMENT_LIMIT };
}

export async function productPickList() {
  return db
    .select({ id: s.products.id, sku: s.products.sku, name: s.products.name, barcode: s.products.barcode })
    .from(s.products)
    .where(eq(s.products.type, "stock"))
    .orderBy(asc(s.products.name));
}

// ---- Warehouses ------------------------------------------------------------------------------

export async function listWarehouses() {
  const stats = await db
    .select({
      warehouseId: s.stockBalances.warehouseId,
      skus: sql<number>`count(*) filter (where ${s.stockBalances.qty} > 0)`.mapWith(Number),
      units: sql<number>`coalesce(sum(${s.stockBalances.qty}) filter (where ${s.stockBalances.qty} > 0), 0)`.mapWith(Number),
      value: sql<number>`coalesce(sum(${s.stockBalances.qty} * ${s.stockBalances.avgCost}), 0)`.mapWith(Number),
    })
    .from(s.stockBalances)
    .groupBy(s.stockBalances.warehouseId);
  const locs = await db
    .select({ warehouseId: s.warehouseLocations.warehouseId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(s.warehouseLocations)
    .groupBy(s.warehouseLocations.warehouseId);
  const byWh = new Map(stats.map((r) => [r.warehouseId, r]));
  const locBy = new Map(locs.map((r) => [r.warehouseId, r.n]));
  const rows = await db.select().from(s.warehouses).orderBy(desc(s.warehouses.isDefault), asc(s.warehouses.name));
  return rows.map((w) => ({
    ...w,
    createdAt: w.createdAt.toISOString(),
    skus: byWh.get(w.id)?.skus ?? 0,
    units: r3(byWh.get(w.id)?.units ?? 0),
    value: r2(byWh.get(w.id)?.value ?? 0),
    locations: locBy.get(w.id) ?? 0,
  }));
}
export type WarehouseRow = Awaited<ReturnType<typeof listWarehouses>>[number];

export async function getWarehouseDetail(id: string) {
  const [w] = await db.select().from(s.warehouses).where(eq(s.warehouses.id, id));
  if (!w) return null;
  const [locations, top] = await Promise.all([
    db.select().from(s.warehouseLocations).where(eq(s.warehouseLocations.warehouseId, id)).orderBy(asc(s.warehouseLocations.code)),
    db
      .select({
        productId: s.products.id,
        sku: s.products.sku,
        name: s.products.name,
        unit: s.units.code,
        qty: s.stockBalances.qty,
        avgCost: s.stockBalances.avgCost,
        reorderLevel: s.products.reorderLevel,
      })
      .from(s.stockBalances)
      .innerJoin(s.products, eq(s.products.id, s.stockBalances.productId))
      .innerJoin(s.units, eq(s.units.id, s.products.unitId))
      .where(and(eq(s.stockBalances.warehouseId, id), sql`${s.stockBalances.qty} <> 0`))
      .orderBy(desc(sql`${s.stockBalances.qty} * ${s.stockBalances.avgCost}`)),
  ]);
  return { warehouse: w, locations, stock: top };
}

// ---- Setup -----------------------------------------------------------------------------------

export async function setupData() {
  const countBy = async (col: typeof s.products.categoryId | typeof s.products.brandId | typeof s.products.unitId | typeof s.products.taxRateId) => {
    const rows = await db
      .select({ id: col, n: sql<number>`count(*)`.mapWith(Number) })
      .from(s.products)
      .groupBy(col);
    return new Map(rows.map((r) => [r.id, r.n]));
  };
  const [categories, brands, units, taxRates, byCat, byBrand, byUnit, byTax] = await Promise.all([
    db.select().from(s.productCategories).orderBy(asc(s.productCategories.name)),
    db.select().from(s.brands).orderBy(asc(s.brands.name)),
    db.select().from(s.units).orderBy(asc(s.units.name)),
    db.select().from(s.taxRates).orderBy(asc(s.taxRates.rate)),
    countBy(s.products.categoryId),
    countBy(s.products.brandId),
    countBy(s.products.unitId),
    countBy(s.products.taxRateId),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, description: c.description, products: byCat.get(c.id) ?? 0 })),
    brands: brands.map((b) => ({ id: b.id, name: b.name, products: byBrand.get(b.id) ?? 0 })),
    units: units.map((u) => ({ id: u.id, code: u.code, name: u.name, allowFraction: u.allowFraction, products: byUnit.get(u.id) ?? 0 })),
    taxRates: taxRates.map((t) => ({ id: t.id, name: t.name, rate: t.rate, isDefault: t.isDefault, isActive: t.isActive, products: byTax.get(t.id) ?? 0 })),
  };
}
export type SetupData = Awaited<ReturnType<typeof setupData>>;
