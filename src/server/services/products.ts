import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { batches, brands, numberSeries, productCategories, products, stockBalances, taxRates, units, warehouses } from "@/db/schema";
import { round2, round3, today } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import type { ProductImportInput, ProductInput } from "./inventory-schemas";
import { nextNumber, SERIES } from "./numbering";
import { createBatch, moveStock } from "./stock";

/** The SKU the next product would get, without reserving it (for pre-filling the form). */
export async function peekSku(db: DbOrTx): Promise<string> {
  const [row] = await db.select().from(numberSeries).where(eq(numberSeries.key, "SKU"));
  const prefix = row?.prefix ?? SERIES.SKU.prefix;
  const n = row?.nextNumber ?? 1;
  return `${prefix}${String(n).padStart(row?.padding ?? 5, "0")}`;
}

async function assertUniqueCodes(db: DbOrTx, sku: string, barcode: string | null, exceptId?: string | null) {
  const skuClash = await db
    .select({ id: products.id })
    .from(products)
    .where(and(sql`lower(${products.sku}) = lower(${sku})`, exceptId ? ne(products.id, exceptId) : undefined));
  if (skuClash.length) throw new AppError(`SKU ${sku} is already used by another product`, { sku: "This SKU is already in use" });
  if (barcode) {
    const bcClash = await db
      .select({ name: products.name })
      .from(products)
      .where(and(eq(products.barcode, barcode), exceptId ? ne(products.id, exceptId) : undefined));
    if (bcClash.length) throw new AppError(`Barcode ${barcode} is already on "${bcClash[0].name}"`, { barcode: "This barcode is already in use" });
  }
}

async function assertRefs(db: DbOrTx, input: Pick<ProductInput, "unitId" | "categoryId" | "brandId" | "taxRateId">) {
  const [unit] = await db.select().from(units).where(eq(units.id, input.unitId));
  if (!unit) throw new AppError("Choose a unit", { unitId: "Choose a unit" });
  if (input.categoryId && !(await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.id, input.categoryId))).length)
    throw new AppError("Category not found", { categoryId: "Category not found" });
  if (input.brandId && !(await db.select({ id: brands.id }).from(brands).where(eq(brands.id, input.brandId))).length)
    throw new AppError("Brand not found", { brandId: "Brand not found" });
  if (input.taxRateId && !(await db.select({ id: taxRates.id }).from(taxRates).where(eq(taxRates.id, input.taxRateId))).length)
    throw new AppError("Tax rate not found", { taxRateId: "Tax rate not found" });
  return unit;
}

function productValues(input: ProductInput) {
  return {
    barcode: input.barcode,
    name: input.name,
    description: input.description,
    type: input.type,
    categoryId: input.categoryId,
    brandId: input.brandId,
    unitId: input.unitId,
    taxRateId: input.taxRateId,
    costPrice: round2(input.costPrice),
    salePrice: round2(input.salePrice),
    minSalePrice: round2(input.minSalePrice),
    wholesalePrice: input.wholesalePrice ? round2(input.wholesalePrice) : null,
    reorderLevel: round3(input.reorderLevel),
    reorderQty: round3(input.reorderQty),
    trackBatches: input.type === "stock" ? input.trackBatches : false,
    color: input.color,
    size: input.size,
    material: input.material,
    imageUrl: input.imageUrl,
    isActive: input.isActive,
  };
}

/**
 * Create a product. Opening stock rows (per warehouse, optional rolls for batch-tracked items)
 * are received with moveStock("opening") and booked Dr Inventory / Cr Opening Balance Equity.
 */
export async function createProduct(db: DbOrTx, actor: Actor | null, input: ProductInput) {
  const unit = await assertRefs(db, input);
  if (input.minSalePrice > 0 && input.salePrice > 0 && input.minSalePrice > input.salePrice)
    throw new AppError("Minimum sale price can't be above the sale price", { minSalePrice: "Above the sale price" });

  const sku = input.skuAuto || !input.sku ? await nextNumber(db, "SKU") : input.sku;
  await assertUniqueCodes(db, sku, input.barcode);

  const [product] = await db
    .insert(products)
    .values({ sku, ...productValues(input) })
    .returning();

  let openingValue = 0;
  const date = input.openingDate ?? today();
  if (product.type === "stock") {
    const seen = new Set<string>();
    for (const row of input.opening) {
      const rolls = product.trackBatches ? row.rolls : [];
      const qty = rolls.length ? round3(rolls.reduce((s, r) => s + r.qty, 0)) : round3(row.qty);
      if (qty <= 0) continue;
      if (seen.has(row.warehouseId)) throw new AppError("Each warehouse can appear only once in opening stock");
      seen.add(row.warehouseId);
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, row.warehouseId));
      if (!wh) throw new AppError("Warehouse not found");
      if (!unit.allowFraction && rolls.length === 0 && !Number.isInteger(qty))
        throw new AppError(`${unit.name} can't be split: use a whole number for ${wh.name}`);
      const unitCost = round2(row.unitCost || input.costPrice);
      const common = { date, productId: product.id, warehouseId: wh.id, unitCost, sourceType: "opening" as const, sourceId: product.id, sourceNumber: "Opening stock" };
      if (rolls.length) {
        const nos = new Set<string>();
        for (const r of rolls) {
          const key = r.batchNo.toLowerCase();
          if (nos.has(key)) throw new AppError(`Roll ${r.batchNo} is listed twice`);
          nos.add(key);
          const batch = await createBatch(db, { productId: product.id, warehouseId: wh.id, batchNo: r.batchNo, qty: r.qty, unitCost, receivedDate: date, shade: r.shade });
          const res = await moveStock(db, actor, { ...common, qty: r.qty, batchId: batch.id });
          openingValue = round2(openingValue + res.value);
        }
      } else {
        const res = await moveStock(db, actor, { ...common, qty });
        openingValue = round2(openingValue + res.value);
      }
    }
  }

  if (openingValue > 0) {
    await postJournal(db, actor, {
      date,
      memo: `Opening stock: ${product.name}`,
      sourceType: "opening",
      sourceId: product.id,
      sourceNumber: product.sku,
      lines: [
        { account: ACC.INVENTORY, debit: openingValue },
        { account: ACC.OPENING_BALANCE, credit: openingValue },
      ],
    });
  }

  await logAudit(db, actor, {
    action: "create",
    entity: "product",
    entityId: product.id,
    summary: `Created product ${product.sku} ${product.name}${openingValue ? ` with opening stock worth ${openingValue}` : ""}`,
  });
  return { id: product.id, sku: product.sku, openingValue };
}

export async function updateProduct(db: DbOrTx, actor: Actor | null, input: ProductInput) {
  if (!input.id) throw new AppError("Product not found");
  const [existing] = await db.select().from(products).where(eq(products.id, input.id));
  if (!existing) throw new AppError("Product not found");
  await assertRefs(db, input);
  if (input.minSalePrice > 0 && input.salePrice > 0 && input.minSalePrice > input.salePrice)
    throw new AppError("Minimum sale price can't be above the sale price", { minSalePrice: "Above the sale price" });
  const sku = input.sku || existing.sku;
  await assertUniqueCodes(db, sku, input.barcode, existing.id);

  if (existing.type === "stock" && input.type === "service") {
    const [row] = await db
      .select({ qty: sql<number>`coalesce(sum(${stockBalances.qty}), 0)`.mapWith(Number) })
      .from(stockBalances)
      .where(eq(stockBalances.productId, existing.id));
    if (Math.abs(row.qty) > 0.0005) throw new AppError("This product still has stock on hand, so it can't become a service", { type: "Stock on hand" });
  }

  await db
    .update(products)
    .set({ sku, ...productValues(input) })
    .where(eq(products.id, existing.id));
  await logAudit(db, actor, { action: "update", entity: "product", entityId: existing.id, summary: `Updated product ${sku} ${input.name}` });
  return { id: existing.id };
}

export async function setProductActive(db: DbOrTx, actor: Actor | null, id: string, isActive: boolean) {
  const [p] = await db.update(products).set({ isActive }).where(eq(products.id, id)).returning();
  if (!p) throw new AppError("Product not found");
  await logAudit(db, actor, {
    action: isActive ? "activate" : "deactivate",
    entity: "product",
    entityId: id,
    summary: `${isActive ? "Activated" : "Deactivated"} product ${p.sku} ${p.name}`,
  });
  return { id };
}

/**
 * Bulk create products from a CSV. Units must exist (by code); categories and brands are created
 * by name when missing. Rows whose SKU already exists are skipped. Optional opening quantity is
 * received at the cost price and booked in one opening journal.
 */
export async function importProducts(db: DbOrTx, actor: Actor | null, input: ProductImportInput) {
  const unitRows = await db.select().from(units);
  const unitByCode = new Map(unitRows.map((u) => [u.code.toLowerCase(), u]));
  const catMap = new Map((await db.select().from(productCategories)).map((c) => [c.name.toLowerCase(), c.id]));
  const brandMap = new Map((await db.select().from(brands)).map((b) => [b.name.toLowerCase(), b.id]));
  const taxRows = await db.select().from(taxRates);
  const whRows = await db.select().from(warehouses);
  const whByCode = new Map(whRows.map((w) => [w.code.toLowerCase(), w]));
  const defaultWh = whRows.find((w) => w.isDefault && w.isActive) ?? whRows[0];

  const skus = input.rows.map((r) => r.sku).filter(Boolean);
  const existingSkus = new Set(
    skus.length
      ? (await db.select({ sku: products.sku }).from(products).where(inArray(sql`lower(${products.sku})`, skus.map((s) => s.toLowerCase())))).map((r) => r.sku.toLowerCase())
      : []
  );

  const skipped: { row: number; name: string; reason: string }[] = [];
  let created = 0;
  let openingValue = 0;
  const batchSkus = new Set<string>();

  for (const [i, r] of input.rows.entries()) {
    const rowNo = i + 2; // header is row 1
    const unit = unitByCode.get(r.unit.toLowerCase());
    if (!unit) {
      skipped.push({ row: rowNo, name: r.name, reason: `Unknown unit "${r.unit}"` });
      continue;
    }
    if (r.sku && (existingSkus.has(r.sku.toLowerCase()) || batchSkus.has(r.sku.toLowerCase()))) {
      skipped.push({ row: rowNo, name: r.name, reason: `SKU ${r.sku} already exists` });
      continue;
    }
    const type = r.type.toLowerCase() === "service" ? "service" : "stock";
    let categoryId: string | null = null;
    if (r.category) {
      categoryId = catMap.get(r.category.toLowerCase()) ?? null;
      if (!categoryId) {
        const [c] = await db.insert(productCategories).values({ name: r.category }).returning();
        categoryId = c.id;
        catMap.set(r.category.toLowerCase(), c.id);
      }
    }
    let brandId: string | null = null;
    if (r.brand) {
      brandId = brandMap.get(r.brand.toLowerCase()) ?? null;
      if (!brandId) {
        const [b] = await db.insert(brands).values({ name: r.brand }).returning();
        brandId = b.id;
        brandMap.set(r.brand.toLowerCase(), b.id);
      }
    }
    const tax = r.taxRate > 0 ? taxRows.find((t) => Math.abs(t.rate - r.taxRate) < 0.001) : undefined;
    if (r.taxRate > 0 && !tax) {
      skipped.push({ row: rowNo, name: r.name, reason: `No tax rate of ${r.taxRate}% is set up` });
      continue;
    }
    if (r.barcode) {
      const clash = await db.select({ id: products.id }).from(products).where(eq(products.barcode, r.barcode));
      if (clash.length) {
        skipped.push({ row: rowNo, name: r.name, reason: `Barcode ${r.barcode} already in use` });
        continue;
      }
    }
    const wh = r.openingQty > 0 ? (r.openingWarehouse ? whByCode.get(r.openingWarehouse.toLowerCase()) : defaultWh) : undefined;
    if (r.openingQty > 0 && !wh) {
      skipped.push({ row: rowNo, name: r.name, reason: `Unknown warehouse "${r.openingWarehouse}"` });
      continue;
    }

    const sku = r.sku || (await nextNumber(db, "SKU"));
    batchSkus.add(sku.toLowerCase());
    const [p] = await db
      .insert(products)
      .values({
        sku,
        name: r.name,
        barcode: r.barcode || null,
        type,
        categoryId,
        brandId,
        unitId: unit.id,
        taxRateId: tax?.id ?? null,
        costPrice: round2(r.cost),
        salePrice: round2(r.sale),
        minSalePrice: round2(r.minSale),
        wholesalePrice: r.wholesale ? round2(r.wholesale) : null,
        reorderLevel: round3(r.reorderLevel),
        reorderQty: round3(r.reorderQty),
        trackBatches: type === "stock" ? r.trackBatches : false,
        color: r.color || null,
        size: r.size || null,
        material: r.material || null,
      })
      .returning();
    created++;
    if (type === "stock" && wh && r.openingQty > 0) {
      const res = await moveStock(db, actor, {
        date: input.date,
        productId: p.id,
        warehouseId: wh.id,
        qty: r.openingQty,
        unitCost: round2(r.cost),
        sourceType: "opening",
        sourceId: p.id,
        sourceNumber: "Opening stock",
      });
      openingValue = round2(openingValue + res.value);
    }
  }

  if (openingValue > 0) {
    await postJournal(db, actor, {
      date: input.date,
      memo: "Opening stock (product import)",
      sourceType: "opening",
      lines: [
        { account: ACC.INVENTORY, debit: openingValue },
        { account: ACC.OPENING_BALANCE, credit: openingValue },
      ],
    });
  }
  await logAudit(db, actor, {
    action: "import",
    entity: "product",
    summary: `Imported ${created} product(s)${skipped.length ? `, skipped ${skipped.length}` : ""}${openingValue ? `, opening stock ${openingValue}` : ""}`,
  });
  return { created, skipped, openingValue };
}

/** Rolls of a product in a warehouse that still have quantity (for transfer / adjustment pickers). */
export async function openBatches(db: DbOrTx, productId: string, warehouseId: string) {
  return db
    .select()
    .from(batches)
    .where(and(eq(batches.productId, productId), eq(batches.warehouseId, warehouseId), sql`${batches.qty} > 0`));
}
