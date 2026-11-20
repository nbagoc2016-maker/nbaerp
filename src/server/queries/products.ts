import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { addDays, today } from "@/lib/format";
import { peekSku } from "@/server/services/products";

export type ProductRow = Awaited<ReturnType<typeof listProducts>>[number];

/** Every product with its total on hand and stock value across warehouses. */
export async function listProducts() {
  const totals = db
    .select({
      productId: s.stockBalances.productId,
      qty: sql<number>`sum(${s.stockBalances.qty})`.as("qty"),
      value: sql<number>`sum(${s.stockBalances.qty} * ${s.stockBalances.avgCost})`.as("value"),
    })
    .from(s.stockBalances)
    .groupBy(s.stockBalances.productId)
    .as("totals");

  const rows = await db
    .select({
      id: s.products.id,
      sku: s.products.sku,
      name: s.products.name,
      barcode: s.products.barcode,
      imageUrl: s.products.imageUrl,
      type: s.products.type,
      categoryId: s.products.categoryId,
      category: s.productCategories.name,
      brandId: s.products.brandId,
      brand: s.brands.name,
      unit: s.units.code,
      salePrice: s.products.salePrice,
      costPrice: s.products.costPrice,
      reorderLevel: s.products.reorderLevel,
      trackBatches: s.products.trackBatches,
      color: s.products.color,
      isActive: s.products.isActive,
      onHand: sql<number>`coalesce(${totals.qty}, 0)`.mapWith(Number),
      value: sql<number>`coalesce(${totals.value}, 0)`.mapWith(Number),
    })
    .from(s.products)
    .innerJoin(s.units, eq(s.units.id, s.products.unitId))
    .leftJoin(s.productCategories, eq(s.productCategories.id, s.products.categoryId))
    .leftJoin(s.brands, eq(s.brands.id, s.products.brandId))
    .leftJoin(totals, eq(totals.productId, s.products.id))
    .orderBy(asc(s.products.name));
  return rows.map((r) => ({ ...r, value: Math.round(r.value * 100) / 100 }));
}

/** Categories with their full path ("Fabric › Lawn") for pickers, sorted by path. */
export async function categoryTree() {
  const rows = await db.select().from(s.productCategories);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pathOf = (id: string) => {
    const parts: string[] = [];
    let cur = byId.get(id);
    for (let i = 0; cur && i < 20; i++) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts;
  };
  return rows
    .map((r) => {
      const parts = pathOf(r.id);
      return { ...r, path: parts.join(" › "), depth: parts.length - 1 };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function productFormOptions() {
  const [categories, brands, units, taxRates, warehouses, nextSku] = await Promise.all([
    categoryTree(),
    db.select().from(s.brands).orderBy(asc(s.brands.name)),
    db.select().from(s.units).orderBy(asc(s.units.name)),
    db.select().from(s.taxRates).where(eq(s.taxRates.isActive, true)).orderBy(asc(s.taxRates.rate)),
    db.select().from(s.warehouses).where(eq(s.warehouses.isActive, true)).orderBy(desc(s.warehouses.isDefault), asc(s.warehouses.name)),
    peekSku(db),
  ]);
  return {
    categories: categories.map((c) => ({ value: c.id, label: c.path })),
    brands: brands.map((b) => ({ value: b.id, label: b.name })),
    units: units.map((u) => ({ value: u.id, label: `${u.name} (${u.code})`, allowFraction: u.allowFraction, code: u.code })),
    taxRates: taxRates.map((t) => ({ value: t.id, label: t.name, rate: t.rate, isDefault: t.isDefault })),
    warehouses: warehouses.map((w) => ({ value: w.id, label: w.name, hint: w.code })),
    nextSku,
  };
}
export type ProductFormOptions = Awaited<ReturnType<typeof productFormOptions>>;

export async function getProduct(id: string) {
  const [p] = await db.select().from(s.products).where(eq(s.products.id, id));
  return p ?? null;
}

export async function productDetail(id: string) {
  const [row] = await db
    .select({
      product: s.products,
      unit: s.units.code,
      unitName: s.units.name,
      category: s.productCategories.name,
      brand: s.brands.name,
      taxName: s.taxRates.name,
      taxRate: s.taxRates.rate,
    })
    .from(s.products)
    .innerJoin(s.units, eq(s.units.id, s.products.unitId))
    .leftJoin(s.productCategories, eq(s.productCategories.id, s.products.categoryId))
    .leftJoin(s.brands, eq(s.brands.id, s.products.brandId))
    .leftJoin(s.taxRates, eq(s.taxRates.id, s.products.taxRateId))
    .where(eq(s.products.id, id));
  if (!row) return null;

  const since = addDays(today(), -30);
  const [byWarehouse, batches, movements, sold] = await Promise.all([
    db
      .select({
        warehouseId: s.warehouses.id,
        warehouse: s.warehouses.name,
        code: s.warehouses.code,
        qty: s.stockBalances.qty,
        reservedQty: s.stockBalances.reservedQty,
        avgCost: s.stockBalances.avgCost,
      })
      .from(s.stockBalances)
      .innerJoin(s.warehouses, eq(s.warehouses.id, s.stockBalances.warehouseId))
      .where(eq(s.stockBalances.productId, id))
      .orderBy(asc(s.warehouses.name)),
    db
      .select({ batch: s.batches, warehouse: s.warehouses.name })
      .from(s.batches)
      .innerJoin(s.warehouses, eq(s.warehouses.id, s.batches.warehouseId))
      .where(eq(s.batches.productId, id))
      .orderBy(desc(sql`${s.batches.qty} > 0`), desc(s.batches.createdAt)),
    db
      .select({ m: s.stockMovements, warehouse: s.warehouses.name, batchNo: s.batches.batchNo })
      .from(s.stockMovements)
      .innerJoin(s.warehouses, eq(s.warehouses.id, s.stockMovements.warehouseId))
      .leftJoin(s.batches, eq(s.batches.id, s.stockMovements.batchId))
      .where(eq(s.stockMovements.productId, id))
      .orderBy(desc(s.stockMovements.createdAt))
      .limit(25),
    db
      .select({
        qty: sql<number>`coalesce(sum(case when ${s.stockMovements.sourceType} = 'sales_invoice' then -${s.stockMovements.qty} when ${s.stockMovements.sourceType} = 'sales_return' then -${s.stockMovements.qty} else 0 end), 0)`.mapWith(Number),
      })
      .from(s.stockMovements)
      .where(and(eq(s.stockMovements.productId, id), gte(s.stockMovements.date, since), inArray(s.stockMovements.sourceType, ["sales_invoice", "sales_return"]))),
  ]);

  const onHand = byWarehouse.reduce((t, w) => t + w.qty, 0);
  const value = byWarehouse.reduce((t, w) => t + w.qty * w.avgCost, 0);
  return {
    ...row,
    byWarehouse,
    batches,
    movements,
    onHand: Math.round(onHand * 1000) / 1000,
    value: Math.round(value * 100) / 100,
    avgCost: onHand > 0 ? Math.round((value / onHand) * 100) / 100 : (byWarehouse[0]?.avgCost ?? 0),
    soldLast30: Math.round((sold[0]?.qty ?? 0) * 1000) / 1000,
  };
}
