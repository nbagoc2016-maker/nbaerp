import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, day, id, money, qty } from "./_helpers";
import { users } from "./core";
import { products, warehouses } from "./masters";

// ---- Bill of Materials (BOM) ------------------------------------------------------------------

export const bom = pgTable(
  "bom",
  {
    id: id(),
    number: text("number").notNull().unique(), // e.g. BOM-00001
    name: text("name").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    outputQty: qty("output_qty").notNull().default(1),
    laborCost: money("labor_cost").notNull().default(0),
    overheadCost: money("overhead_cost").notNull().default(0),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("bom_product_idx").on(t.productId)]
);

export const bomLines = pgTable("bom_lines", {
  id: id(),
  bomId: text("bom_id")
    .notNull()
    .references(() => bom.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull().default(0),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  qty: qty("qty").notNull(),
  scrapPct: money("scrap_pct").notNull().default(0), // expected scrap %
  notes: text("notes"),
});

// ---- Work Orders (Production Runs) ------------------------------------------------------------

export const WORK_ORDER_STATUSES = ["draft", "confirmed", "completed", "cancelled"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const workOrders = pgTable(
  "work_orders",
  {
    id: id(),
    number: text("number").notNull().unique(), // e.g. WO-00001
    date: day("date").notNull(),
    dueDate: day("due_date"),
    bomId: text("bom_id").references(() => bom.id, { onDelete: "set null" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    targetQty: qty("target_qty").notNull(),
    producedQty: qty("produced_qty").notNull().default(0),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    status: text("status", { enum: WORK_ORDER_STATUSES }).notNull().default("draft"),
    laborCost: money("labor_cost").notNull().default(0),
    overheadCost: money("overhead_cost").notNull().default(0),
    materialCost: money("material_cost").notNull().default(0),
    totalCost: money("total_cost").notNull().default(0),
    unitCost: money("unit_cost").notNull().default(0),
    journalEntryId: text("journal_entry_id"),
    completedAt: day("completed_at"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("wo_date_idx").on(t.date), index("wo_product_idx").on(t.productId)]
);

export const workOrderLines = pgTable("work_order_lines", {
  id: id(),
  workOrderId: text("work_order_id")
    .notNull()
    .references(() => workOrders.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull().default(0),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  plannedQty: qty("planned_qty").notNull(),
  actualQty: qty("actual_qty").notNull(),
  unitCost: money("unit_cost").notNull().default(0),
  totalCost: money("total_cost").notNull().default(0),
  notes: text("notes"),
});
