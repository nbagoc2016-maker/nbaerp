// Warehouses, bin locations and the product masters (categories, brands, units, tax rates).
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@/db/client";
import {
  batches,
  brands,
  goodsReceipts,
  productCategories,
  products,
  purchaseOrders,
  purchaseReturns,
  salesInvoices,
  salesOrders,
  salesReturns,
  stockAdjustments,
  stockBalances,
  stockCounts,
  stockMovements,
  stockTransfers,
  supplierBills,
  taxRates,
  units,
  warehouseLocations,
  warehouses,
} from "@/db/schema";
import { round2 } from "@/lib/format";
import { AppError } from "../errors";
import { logAudit, type Actor } from "./audit";
import type { BrandInput, CategoryInput, LocationInput, TaxRateInput, UnitInput, WarehouseInput } from "./inventory-schemas";

async function countWhere(db: DbOrTx, table: PgTable, where: SQL | undefined) {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(table)
    .where(where);
  return row?.n ?? 0;
}

/** Number of rows across several tables pointing at an id (for "in use" protection on delete). */
async function referenceCount(db: DbOrTx, id: string, refs: [PgTable, PgColumn][]) {
  let n = 0;
  for (const [table, col] of refs) n += await countWhere(db, table, eq(col, id));
  return n;
}

// ---- Warehouses ------------------------------------------------------------------------------

export async function saveWarehouse(db: DbOrTx, actor: Actor | null, input: WarehouseInput) {
  const clash = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(sql`upper(${warehouses.code}) = ${input.code}`, input.id ? ne(warehouses.id, input.id) : undefined));
  if (clash.length) throw new AppError(`Code ${input.code} is already used`, { code: "Already in use" });

  const values = {
    code: input.code,
    name: input.name,
    type: input.type,
    address: input.address,
    phone: input.phone,
    managerName: input.managerName,
    isDefault: input.isDefault,
    isActive: input.isDefault ? true : input.isActive,
  };

  let id = input.id;
  if (id) {
    const [existing] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    if (!existing) throw new AppError("Warehouse not found");
    if (existing.isDefault && !input.isDefault) throw new AppError("Make another warehouse the default instead of switching this one off", { isDefault: "One warehouse must stay default" });
    if (existing.isActive && !values.isActive) {
      const [row] = await db
        .select({ qty: sql<number>`coalesce(sum(abs(${stockBalances.qty})), 0)`.mapWith(Number) })
        .from(stockBalances)
        .where(eq(stockBalances.warehouseId, id));
      if (row.qty > 0.0005) throw new AppError("This warehouse still holds stock. Transfer it out before deactivating.", { isActive: "Still holds stock" });
    }
    await db.update(warehouses).set(values).where(eq(warehouses.id, id));
    await logAudit(db, actor, { action: "update", entity: "warehouse", entityId: id, summary: `Updated warehouse ${input.code} ${input.name}` });
  } else {
    const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(warehouses);
    if (n === 0) values.isDefault = true;
    const [w] = await db.insert(warehouses).values(values).returning();
    id = w.id;
    await logAudit(db, actor, { action: "create", entity: "warehouse", entityId: id, summary: `Created warehouse ${input.code} ${input.name}` });
  }
  // Keep exactly one default
  if (values.isDefault) await db.update(warehouses).set({ isDefault: false }).where(and(ne(warehouses.id, id), eq(warehouses.isDefault, true)));
  return { id };
}

export async function deleteWarehouse(db: DbOrTx, actor: Actor | null, id: string) {
  const [w] = await db.select().from(warehouses).where(eq(warehouses.id, id));
  if (!w) throw new AppError("Warehouse not found");
  if (w.isDefault) throw new AppError("The default warehouse can't be deleted");
  const used =
    (await referenceCount(db, id, [
      [stockMovements, stockMovements.warehouseId],
      [batches, batches.warehouseId],
      [stockAdjustments, stockAdjustments.warehouseId],
      [stockCounts, stockCounts.warehouseId],
      [stockTransfers, stockTransfers.fromWarehouseId],
      [stockTransfers, stockTransfers.toWarehouseId],
      [salesOrders, salesOrders.warehouseId],
      [salesInvoices, salesInvoices.warehouseId],
      [salesReturns, salesReturns.warehouseId],
      [purchaseOrders, purchaseOrders.warehouseId],
      [goodsReceipts, goodsReceipts.warehouseId],
      [supplierBills, supplierBills.warehouseId],
      [purchaseReturns, purchaseReturns.warehouseId],
    ])) > 0;
  if (used) throw new AppError(`${w.name} has stock history or documents, so it can't be deleted. Deactivate it instead.`);
  await db.delete(stockBalances).where(eq(stockBalances.warehouseId, id));
  await db.delete(warehouses).where(eq(warehouses.id, id));
  await logAudit(db, actor, { action: "delete", entity: "warehouse", entityId: id, summary: `Deleted warehouse ${w.code} ${w.name}` });
  return { id };
}

export async function saveLocation(db: DbOrTx, actor: Actor | null, input: LocationInput) {
  const [w] = await db.select().from(warehouses).where(eq(warehouses.id, input.warehouseId));
  if (!w) throw new AppError("Warehouse not found");
  const clash = await db
    .select({ id: warehouseLocations.id })
    .from(warehouseLocations)
    .where(and(eq(warehouseLocations.warehouseId, w.id), eq(warehouseLocations.code, input.code), input.id ? ne(warehouseLocations.id, input.id) : undefined));
  if (clash.length) throw new AppError(`Location ${input.code} already exists in ${w.name}`, { code: "Already exists" });
  let id = input.id;
  if (id) {
    await db.update(warehouseLocations).set({ code: input.code, name: input.name, isActive: input.isActive }).where(eq(warehouseLocations.id, id));
  } else {
    const [l] = await db.insert(warehouseLocations).values({ warehouseId: w.id, code: input.code, name: input.name, isActive: input.isActive }).returning();
    id = l.id;
  }
  await logAudit(db, actor, { action: input.id ? "update" : "create", entity: "warehouse_location", entityId: id, summary: `${input.id ? "Updated" : "Added"} location ${input.code} in ${w.name}` });
  return { id };
}

export async function deleteLocation(db: DbOrTx, actor: Actor | null, id: string) {
  const [l] = await db.delete(warehouseLocations).where(eq(warehouseLocations.id, id)).returning();
  if (!l) throw new AppError("Location not found");
  await logAudit(db, actor, { action: "delete", entity: "warehouse_location", entityId: id, summary: `Deleted location ${l.code}` });
  return { id };
}

// ---- Categories ------------------------------------------------------------------------------

export async function saveCategory(db: DbOrTx, actor: Actor | null, input: CategoryInput) {
  const clash = await db
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(
      and(
        sql`lower(${productCategories.name}) = lower(${input.name})`,
        input.parentId ? eq(productCategories.parentId, input.parentId) : sql`${productCategories.parentId} is null`,
        input.id ? ne(productCategories.id, input.id) : undefined
      )
    );
  if (clash.length) throw new AppError(`A category named "${input.name}" already exists here`, { name: "Already exists" });

  if (input.id && input.parentId) {
    // Walk up from the new parent: we must never reach ourselves (no loops)
    const all = await db.select({ id: productCategories.id, parentId: productCategories.parentId }).from(productCategories);
    const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
    let cur: string | null | undefined = input.parentId;
    for (let i = 0; cur && i < 100; i++) {
      if (cur === input.id) throw new AppError("A category can't sit inside itself or one of its sub-categories", { parentId: "Creates a loop" });
      cur = parentOf.get(cur);
    }
  }
  let id = input.id;
  const values = { name: input.name, parentId: input.parentId, description: input.description };
  if (id) await db.update(productCategories).set(values).where(eq(productCategories.id, id));
  else id = (await db.insert(productCategories).values(values).returning())[0].id;
  await logAudit(db, actor, { action: input.id ? "update" : "create", entity: "product_category", entityId: id, summary: `${input.id ? "Updated" : "Created"} category ${input.name}` });
  return { id };
}

export async function deleteCategory(db: DbOrTx, actor: Actor | null, id: string) {
  const [c] = await db.select().from(productCategories).where(eq(productCategories.id, id));
  if (!c) throw new AppError("Category not found");
  const used = await countWhere(db, products, eq(products.categoryId, id));
  if (used) throw new AppError(`"${c.name}" is used by ${used} product(s). Move them to another category first.`);
  const children = await countWhere(db, productCategories, eq(productCategories.parentId, id));
  if (children) throw new AppError(`"${c.name}" has ${children} sub-categor${children === 1 ? "y" : "ies"}. Delete or move them first.`);
  await db.delete(productCategories).where(eq(productCategories.id, id));
  await logAudit(db, actor, { action: "delete", entity: "product_category", entityId: id, summary: `Deleted category ${c.name}` });
  return { id };
}

// ---- Brands ----------------------------------------------------------------------------------

export async function saveBrand(db: DbOrTx, actor: Actor | null, input: BrandInput) {
  const clash = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(sql`lower(${brands.name}) = lower(${input.name})`, input.id ? ne(brands.id, input.id) : undefined));
  if (clash.length) throw new AppError(`Brand "${input.name}" already exists`, { name: "Already exists" });
  let id = input.id;
  if (id) await db.update(brands).set({ name: input.name }).where(eq(brands.id, id));
  else id = (await db.insert(brands).values({ name: input.name }).returning())[0].id;
  await logAudit(db, actor, { action: input.id ? "update" : "create", entity: "brand", entityId: id, summary: `${input.id ? "Updated" : "Created"} brand ${input.name}` });
  return { id };
}

export async function deleteBrand(db: DbOrTx, actor: Actor | null, id: string) {
  const [b] = await db.select().from(brands).where(eq(brands.id, id));
  if (!b) throw new AppError("Brand not found");
  const used = await countWhere(db, products, eq(products.brandId, id));
  if (used) throw new AppError(`"${b.name}" is used by ${used} product(s), so it can't be deleted`);
  await db.delete(brands).where(eq(brands.id, id));
  await logAudit(db, actor, { action: "delete", entity: "brand", entityId: id, summary: `Deleted brand ${b.name}` });
  return { id };
}

// ---- Units -----------------------------------------------------------------------------------

export async function saveUnit(db: DbOrTx, actor: Actor | null, input: UnitInput) {
  const clash = await db
    .select({ id: units.id })
    .from(units)
    .where(and(sql`lower(${units.code}) = ${input.code}`, input.id ? ne(units.id, input.id) : undefined));
  if (clash.length) throw new AppError(`Unit code "${input.code}" already exists`, { code: "Already exists" });
  let id = input.id;
  const values = { code: input.code, name: input.name, allowFraction: input.allowFraction };
  if (id) await db.update(units).set(values).where(eq(units.id, id));
  else id = (await db.insert(units).values(values).returning())[0].id;
  await logAudit(db, actor, { action: input.id ? "update" : "create", entity: "unit", entityId: id, summary: `${input.id ? "Updated" : "Created"} unit ${input.code}` });
  return { id };
}

export async function deleteUnit(db: DbOrTx, actor: Actor | null, id: string) {
  const [u] = await db.select().from(units).where(eq(units.id, id));
  if (!u) throw new AppError("Unit not found");
  const used = await countWhere(db, products, eq(products.unitId, id));
  if (used) throw new AppError(`"${u.name}" is used by ${used} product(s), so it can't be deleted`);
  await db.delete(units).where(eq(units.id, id));
  await logAudit(db, actor, { action: "delete", entity: "unit", entityId: id, summary: `Deleted unit ${u.code}` });
  return { id };
}

// ---- Tax rates -------------------------------------------------------------------------------

export async function saveTaxRate(db: DbOrTx, actor: Actor | null, input: TaxRateInput) {
  let id = input.id;
  const values = { name: input.name, rate: round2(input.rate), isDefault: input.isDefault, isActive: input.isDefault ? true : input.isActive };
  if (id) {
    const [existing] = await db.select().from(taxRates).where(eq(taxRates.id, id));
    if (!existing) throw new AppError("Tax rate not found");
    await db.update(taxRates).set(values).where(eq(taxRates.id, id));
  } else {
    const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(taxRates);
    if (n === 0) values.isDefault = true;
    id = (await db.insert(taxRates).values(values).returning())[0].id;
  }
  if (values.isDefault) await db.update(taxRates).set({ isDefault: false }).where(and(ne(taxRates.id, id), eq(taxRates.isDefault, true)));
  await logAudit(db, actor, { action: input.id ? "update" : "create", entity: "tax_rate", entityId: id, summary: `${input.id ? "Updated" : "Created"} tax rate ${input.name} (${values.rate}%)` });
  return { id };
}

export async function deleteTaxRate(db: DbOrTx, actor: Actor | null, id: string) {
  const [t] = await db.select().from(taxRates).where(eq(taxRates.id, id));
  if (!t) throw new AppError("Tax rate not found");
  if (t.isDefault) throw new AppError("The default tax rate can't be deleted. Make another one the default first.");
  const used = await countWhere(db, products, eq(products.taxRateId, id));
  if (used) throw new AppError(`"${t.name}" is used by ${used} product(s), so it can't be deleted. Deactivate it instead.`);
  await db.delete(taxRates).where(eq(taxRates.id, id));
  await logAudit(db, actor, { action: "delete", entity: "tax_rate", entityId: id, summary: `Deleted tax rate ${t.name}` });
  return { id };
}
