import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createdAt, day, id, money, qty } from "./_helpers";
import { users } from "./core";
import { products, warehouses } from "./masters";

// Current on-hand per product per warehouse, kept in step with stock_movements by the stock engine.
// avg_cost is the moving-average unit cost used for valuation and COGS.
export const stockBalances = pgTable(
  "stock_balances",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    qty: qty("qty").notNull().default(0),
    avgCost: money("avg_cost").notNull().default(0),
    reservedQty: qty("reserved_qty").notNull().default(0), // held by confirmed sales orders
  },
  (t) => [primaryKey({ columns: [t.productId, t.warehouseId] })]
);

// Rolls / lots. For fabric: one thaan with its own length, e.g. ROLL-0042, 38.5 m.
export const batches = pgTable(
  "batches",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    batchNo: text("batch_no").notNull(),
    initialQty: qty("initial_qty").notNull(),
    qty: qty("qty").notNull(),
    unitCost: money("unit_cost").notNull().default(0),
    receivedDate: day("received_date"),
    expiryDate: day("expiry_date"),
    shade: text("shade"), // dye lot / shade code
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("batches_product_idx").on(t.productId, t.warehouseId)]
);

export const STOCK_SOURCES = [
  "opening",
  "goods_receipt",
  "supplier_bill",
  "purchase_return",
  "sales_invoice",
  "sales_return",
  "transfer_out",
  "transfer_in",
  "adjustment",
  "stock_count",
] as const;

// Immutable stock ledger. qty is signed: + in, - out.
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    date: day("date").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    batchId: text("batch_id"),
    qty: qty("qty").notNull(),
    unitCost: money("unit_cost").notNull().default(0),
    value: money("value").notNull().default(0), // qty * unit cost, signed
    balanceQty: qty("balance_qty").notNull().default(0), // on hand in this warehouse after the move
    sourceType: text("source_type", { enum: STOCK_SOURCES }).notNull(),
    sourceId: text("source_id"),
    sourceNumber: text("source_number"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("sm_product_idx").on(t.productId, t.warehouseId, t.createdAt),
    index("sm_source_idx").on(t.sourceType, t.sourceId),
  ]
);

const docStatus = () => text("status", { enum: ["draft", "posted", "void"] }).notNull().default("draft");

export const stockTransfers = pgTable("stock_transfers", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  fromWarehouseId: text("from_warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  toWarehouseId: text("to_warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  status: docStatus(),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const stockTransferLines = pgTable("stock_transfer_lines", {
  id: id(),
  transferId: text("transfer_id")
    .notNull()
    .references(() => stockTransfers.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  batchId: text("batch_id"),
  qty: qty("qty").notNull(),
});

export const stockAdjustments = pgTable("stock_adjustments", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  reason: text("reason", { enum: ["damage", "loss", "found", "correction", "sample", "opening", "other"] })
    .notNull()
    .default("correction"),
  status: docStatus(),
  notes: text("notes"),
  totalValue: money("total_value").notNull().default(0),
  journalEntryId: text("journal_entry_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const stockAdjustmentLines = pgTable("stock_adjustment_lines", {
  id: id(),
  adjustmentId: text("adjustment_id")
    .notNull()
    .references(() => stockAdjustments.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  batchId: text("batch_id"),
  qtyChange: qty("qty_change").notNull(), // signed
  unitCost: money("unit_cost").notNull().default(0),
  notes: text("notes"),
});

// Physical stock take: counted vs system qty; posting adjusts stock for the differences
export const stockCounts = pgTable("stock_counts", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  status: text("status", { enum: ["draft", "counting", "posted", "void"] }).notNull().default("draft"),
  notes: text("notes"),
  journalEntryId: text("journal_entry_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const stockCountLines = pgTable("stock_count_lines", {
  id: id(),
  countId: text("count_id")
    .notNull()
    .references(() => stockCounts.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  systemQty: qty("system_qty").notNull().default(0),
  countedQty: qty("counted_qty"),
  unitCost: money("unit_cost").notNull().default(0),
});
