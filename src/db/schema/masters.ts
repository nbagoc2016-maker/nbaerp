import { boolean, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, money, qty, updatedAt } from "./_helpers";

export const units = pgTable("units", {
  id: id(),
  code: text("code").notNull().unique(), // pcs, m, yd, kg, suit
  name: text("name").notNull(),
  allowFraction: boolean("allow_fraction").notNull().default(false),
  createdAt: createdAt(),
});

export const taxRates = pgTable("tax_rates", {
  id: id(),
  name: text("name").notNull(),
  rate: money("rate").notNull().default(0), // percent
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const productCategories = pgTable("product_categories", {
  id: id(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  description: text("description"),
  createdAt: createdAt(),
});

export const brands = pgTable("brands", {
  id: id(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

export const products = pgTable(
  "products",
  {
    id: id(),
    sku: text("sku").notNull().unique(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type", { enum: ["stock", "service"] }).notNull().default("stock"),
    categoryId: text("category_id").references(() => productCategories.id, { onDelete: "set null" }),
    brandId: text("brand_id").references(() => brands.id, { onDelete: "set null" }),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id),
    taxRateId: text("tax_rate_id").references(() => taxRates.id, { onDelete: "set null" }),
    costPrice: money("cost_price").notNull().default(0), // last purchase cost (valuation uses moving average)
    salePrice: money("sale_price").notNull().default(0),
    minSalePrice: money("min_sale_price").notNull().default(0), // floor for discounts / bargaining
    wholesalePrice: money("wholesale_price"),
    reorderLevel: qty("reorder_level").notNull().default(0),
    reorderQty: qty("reorder_qty").notNull().default(0),
    // Track individual rolls / lots (fabric thaans, batches) with their own length/qty
    trackBatches: boolean("track_batches").notNull().default(false),
    color: text("color"),
    size: text("size"),
    material: text("material"),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_name_idx").on(t.name), index("products_barcode_idx").on(t.barcode)]
);

export const warehouses = pgTable("warehouses", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type", { enum: ["warehouse", "shop", "transit"] }).notNull().default("warehouse"),
  address: text("address"),
  phone: text("phone"),
  managerName: text("manager_name"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

// Bin / rack locations inside a warehouse (optional)
export const warehouseLocations = pgTable(
  "warehouse_locations",
  {
    id: id(),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // e.g. A-01-03
    name: text("name"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("wh_location_code_uq").on(t.warehouseId, t.code)]
);

const partyColumns = () => ({
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  altPhone: text("alt_phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  taxNumber: text("tax_number"),
  cnic: text("cnic"),
  paymentTermsDays: integer("payment_terms_days").notNull().default(0),
  creditLimit: money("credit_limit").notNull().default(0),
  // Balance carried in from before go-live; posted to the GL as an opening entry
  openingBalance: money("opening_balance").notNull().default(0),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const customers = pgTable(
  "customers",
  {
    ...partyColumns(),
    type: text("type", { enum: ["retail", "wholesale", "corporate"] }).notNull().default("retail"),
    priceLevel: text("price_level", { enum: ["retail", "wholesale"] }).notNull().default("retail"),
  },
  (t) => [index("customers_name_idx").on(t.name), index("customers_phone_idx").on(t.phone)]
);

export const suppliers = pgTable(
  "suppliers",
  {
    ...partyColumns(),
  },
  (t) => [index("suppliers_name_idx").on(t.name)]
);
