import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { ProductOption } from "@/components/app/line-items-editor";
import type { ComboOption } from "@/components/app/combobox";

/**
 * Products for LineItemsEditor. mode "sale" uses sale price, "purchase" uses last cost.
 * onHand is for the given warehouse (or all warehouses when omitted).
 */
export async function productOptions(opts: { mode: "sale" | "purchase"; warehouseId?: string | null; priceLevel?: "retail" | "wholesale" }): Promise<ProductOption[]> {
  const rows = await db
    .select({
      id: s.products.id,
      sku: s.products.sku,
      name: s.products.name,
      barcode: s.products.barcode,
      type: s.products.type,
      unit: s.units.code,
      allowFraction: s.units.allowFraction,
      salePrice: s.products.salePrice,
      wholesalePrice: s.products.wholesalePrice,
      costPrice: s.products.costPrice,
      minSalePrice: s.products.minSalePrice,
      taxRate: sql<number>`coalesce(${s.taxRates.rate}, 0)`.mapWith(Number),
      onHand: sql<number>`coalesce((select sum(qty) from stock_balances b where b.product_id = products.id${
        opts.warehouseId ? sql` and b.warehouse_id = ${opts.warehouseId}` : sql``
      }), 0)`.mapWith(Number),
    })
    .from(s.products)
    .innerJoin(s.units, eq(s.units.id, s.products.unitId))
    .leftJoin(s.taxRates, eq(s.taxRates.id, s.products.taxRateId))
    .where(eq(s.products.isActive, true))
    .orderBy(asc(s.products.name));

  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    barcode: r.barcode,
    type: r.type,
    unit: r.unit,
    allowFraction: r.allowFraction,
    price:
      opts.mode === "purchase"
        ? r.costPrice
        : opts.priceLevel === "wholesale" && r.wholesalePrice
          ? r.wholesalePrice
          : r.salePrice,
    minPrice: r.minSalePrice,
    taxRate: r.taxRate,
    onHand: r.onHand,
  }));
}

export async function customerOptions(): Promise<(ComboOption & { priceLevel: "retail" | "wholesale"; paymentTermsDays: number; phone: string | null })[]> {
  const rows = await db.select().from(s.customers).where(eq(s.customers.isActive, true)).orderBy(asc(s.customers.name));
  return rows.map((c) => ({
    value: c.id,
    label: c.name,
    hint: c.code,
    keywords: `${c.phone ?? ""} ${c.city ?? ""}`,
    priceLevel: c.priceLevel,
    paymentTermsDays: c.paymentTermsDays,
    phone: c.phone,
  }));
}

export async function supplierOptions(): Promise<(ComboOption & { paymentTermsDays: number })[]> {
  const rows = await db.select().from(s.suppliers).where(eq(s.suppliers.isActive, true)).orderBy(asc(s.suppliers.name));
  return rows.map((c) => ({ value: c.id, label: c.name, hint: c.code, keywords: `${c.phone ?? ""} ${c.city ?? ""}`, paymentTermsDays: c.paymentTermsDays }));
}

export async function warehouseOptions(): Promise<(ComboOption & { isDefault: boolean })[]> {
  const rows = await db.select().from(s.warehouses).where(eq(s.warehouses.isActive, true)).orderBy(asc(s.warehouses.name));
  return rows.map((w) => ({ value: w.id, label: w.name, hint: w.code, isDefault: w.isDefault }));
}

export async function defaultWarehouseId(): Promise<string | null> {
  const [w] = await db.select().from(s.warehouses).where(and(eq(s.warehouses.isActive, true), eq(s.warehouses.isDefault, true))).limit(1);
  return w?.id ?? (await db.select().from(s.warehouses).limit(1))[0]?.id ?? null;
}

/** Cash, bank and wallet accounts that can receive or pay money (GL account ids). */
export async function cashBankOptions(opts: { includePettyCash?: boolean } = {}): Promise<ComboOption[]> {
  const subtypes = opts.includePettyCash ? (["cash", "bank", "petty_cash"] as const) : (["cash", "bank"] as const);
  const rows = await db
    .select()
    .from(s.accounts)
    .where(and(inArray(s.accounts.subtype, [...subtypes]), eq(s.accounts.isGroup, false), eq(s.accounts.isActive, true)))
    .orderBy(asc(s.accounts.code));
  return rows.map((a) => ({ value: a.id, label: a.name, hint: a.code }));
}

/** Postable accounts filtered by type (e.g. ["expense"] for expense pickers). */
export async function accountOptions(types?: ("asset" | "liability" | "equity" | "income" | "expense")[]): Promise<ComboOption[]> {
  const rows = await db
    .select()
    .from(s.accounts)
    .where(and(eq(s.accounts.isGroup, false), eq(s.accounts.isActive, true), types?.length ? inArray(s.accounts.type, types) : undefined))
    .orderBy(asc(s.accounts.code));
  return rows.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: a.type, keywords: a.name }));
}

export async function employeeOptions(): Promise<ComboOption[]> {
  const rows = await db.select().from(s.employees).where(eq(s.employees.status, "active")).orderBy(asc(s.employees.name));
  return rows.map((e) => ({ value: e.id, label: e.name, hint: e.code, keywords: e.designation ?? "" }));
}
