import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";

export interface PosProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  type: "stock" | "service";
  categoryId: string | null;
  unit: string;
  allowFraction: boolean;
  price: number;
  wholesalePrice: number | null;
  minPrice: number;
  taxRate: number;
  color: string | null;
  size: string | null;
  imageUrl: string | null;
  /** warehouseId -> on hand */
  stock: Record<string, number>;
}

/** Everything the POS needs in one load: products with prices, tax and stock in every warehouse. */
export async function posCatalog() {
  const rows = await db
    .select({
      id: s.products.id,
      sku: s.products.sku,
      barcode: s.products.barcode,
      name: s.products.name,
      type: s.products.type,
      categoryId: s.products.categoryId,
      unit: s.units.code,
      allowFraction: s.units.allowFraction,
      price: s.products.salePrice,
      wholesalePrice: s.products.wholesalePrice,
      minPrice: s.products.minSalePrice,
      taxRate: sql<number>`coalesce(${s.taxRates.rate}, 0)`.mapWith(Number),
      color: s.products.color,
      size: s.products.size,
      imageUrl: s.products.imageUrl,
    })
    .from(s.products)
    .innerJoin(s.units, eq(s.units.id, s.products.unitId))
    .leftJoin(s.taxRates, eq(s.taxRates.id, s.products.taxRateId))
    .where(eq(s.products.isActive, true))
    .orderBy(asc(s.products.name));
  const balances = await db.select({ productId: s.stockBalances.productId, warehouseId: s.stockBalances.warehouseId, qty: s.stockBalances.qty }).from(s.stockBalances);
  const stock = new Map<string, Record<string, number>>();
  for (const b of balances) {
    const m = stock.get(b.productId) ?? {};
    m[b.warehouseId] = b.qty;
    stock.set(b.productId, m);
  }
  const products: PosProduct[] = rows.map((r) => ({ ...r, stock: stock.get(r.id) ?? {} }));

  const usedCats = new Set(products.map((p) => p.categoryId).filter(Boolean));
  const categories = (await db.select({ id: s.productCategories.id, name: s.productCategories.name }).from(s.productCategories).orderBy(asc(s.productCategories.name))).filter(
    (c) => usedCats.has(c.id)
  );

  const warehouses = await db
    .select({ id: s.warehouses.id, name: s.warehouses.name, code: s.warehouses.code, type: s.warehouses.type, isDefault: s.warehouses.isDefault })
    .from(s.warehouses)
    .where(eq(s.warehouses.isActive, true))
    .orderBy(asc(s.warehouses.name));

  return { products, categories, warehouses };
}
