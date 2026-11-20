import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, day, id, money, qty, updatedAt } from "./_helpers";
import { users } from "./core";
import { products, suppliers, warehouses } from "./masters";

const lineColumns = () => ({
  id: id(),
  lineNo: integer("line_no").notNull().default(0),
  productId: text("product_id").references(() => products.id),
  description: text("description").notNull(),
  qty: qty("qty").notNull(),
  unitCost: money("unit_cost").notNull(),
  discountPct: money("discount_pct").notNull().default(0),
  discountAmount: money("discount_amount").notNull().default(0),
  taxRate: money("tax_rate").notNull().default(0),
  taxAmount: money("tax_amount").notNull().default(0),
  lineTotal: money("line_total").notNull(),
});

const totalsColumns = () => ({
  subtotal: money("subtotal").notNull().default(0),
  discountTotal: money("discount_total").notNull().default(0),
  documentDiscount: money("document_discount").notNull().default(0),
  taxTotal: money("tax_total").notNull().default(0),
  freightCharges: money("freight_charges").notNull().default(0),
  total: money("total").notNull().default(0),
});

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    number: text("number").notNull().unique(),
    date: day("date").notNull(),
    expectedDate: day("expected_date"),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    status: text("status", {
      enum: ["draft", "approved", "sent", "partial", "received", "closed", "cancelled"],
    })
      .notNull()
      .default("draft"),
    ...totalsColumns(),
    terms: text("terms"),
    notes: text("notes"),
    approvedBy: text("approved_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("po_supplier_idx").on(t.supplierId)]
);

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  ...lineColumns(),
  orderId: text("order_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  receivedQty: qty("received_qty").notNull().default(0),
  billedQty: qty("billed_qty").notNull().default(0),
});

// GRN: goods physically received into a warehouse. Posting increases stock and credits
// Goods Received Not Invoiced until the supplier bill arrives.
export const goodsReceipts = pgTable("goods_receipts", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  purchaseOrderId: text("purchase_order_id"),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  supplierDeliveryRef: text("supplier_delivery_ref"),
  status: text("status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
  billStatus: text("bill_status", { enum: ["unbilled", "partial", "billed"] }).notNull().default("unbilled"),
  totalValue: money("total_value").notNull().default(0),
  notes: text("notes"),
  journalEntryId: text("journal_entry_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const goodsReceiptLines = pgTable("goods_receipt_lines", {
  id: id(),
  receiptId: text("receipt_id")
    .notNull()
    .references(() => goodsReceipts.id, { onDelete: "cascade" }),
  purchaseOrderLineId: text("purchase_order_line_id"),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  description: text("description").notNull(),
  qty: qty("qty").notNull(),
  unitCost: money("unit_cost").notNull(),
  batchNo: text("batch_no"), // roll / lot number when the product tracks batches
  batchId: text("batch_id"),
  billedQty: qty("billed_qty").notNull().default(0),
});

export const supplierBills = pgTable(
  "supplier_bills",
  {
    id: id(),
    number: text("number").notNull().unique(),
    supplierInvoiceNo: text("supplier_invoice_no"),
    date: day("date").notNull(),
    dueDate: day("due_date"),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    purchaseOrderId: text("purchase_order_id"),
    goodsReceiptId: text("goods_receipt_id"),
    warehouseId: text("warehouse_id").references(() => warehouses.id),
    // Direct bill (no GRN): stock lines are received into the warehouse when the bill posts
    receivesStock: boolean("receives_stock").notNull().default(false),
    status: text("status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
    paymentStatus: text("payment_status", { enum: ["unpaid", "partial", "paid"] }).notNull().default("unpaid"),
    ...totalsColumns(),
    amountPaid: money("amount_paid").notNull().default(0),
    notes: text("notes"),
    journalEntryId: text("journal_entry_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sb_supplier_idx").on(t.supplierId), index("sb_date_idx").on(t.date)]
);

export const supplierBillLines = pgTable("supplier_bill_lines", {
  ...lineColumns(),
  billId: text("bill_id")
    .notNull()
    .references(() => supplierBills.id, { onDelete: "cascade" }),
  goodsReceiptLineId: text("goods_receipt_line_id"),
  // Set when the line comes from a purchase order line (keeps the PO's billed qty in step)
  purchaseOrderLineId: text("purchase_order_line_id"),
  expenseAccountId: text("expense_account_id"), // for service / non-stock lines
  batchNo: text("batch_no"),
});

export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: id(),
    number: text("number").notNull().unique(),
    date: day("date").notNull(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    method: text("method", { enum: ["cash", "bank", "cheque", "wallet"] }).notNull().default("bank"),
    paidFromAccountId: text("paid_from_account_id").notNull(),
    amount: money("amount").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    status: text("status", { enum: ["posted", "void"] }).notNull().default("posted"),
    journalEntryId: text("journal_entry_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("sp_supplier_idx").on(t.supplierId)]
);

export const paymentAllocations = pgTable("payment_allocations", {
  id: id(),
  paymentId: text("payment_id")
    .notNull()
    .references(() => supplierPayments.id, { onDelete: "cascade" }),
  billId: text("bill_id")
    .notNull()
    .references(() => supplierBills.id),
  amount: money("amount").notNull(),
});

export const purchaseReturns = pgTable("purchase_returns", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  billId: text("bill_id").references(() => supplierBills.id),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  reason: text("reason"),
  status: text("status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
  ...totalsColumns(),
  journalEntryId: text("journal_entry_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const purchaseReturnLines = pgTable("purchase_return_lines", {
  ...lineColumns(),
  returnId: text("return_id")
    .notNull()
    .references(() => purchaseReturns.id, { onDelete: "cascade" }),
  // The supplier bill line being returned (caps the returned qty and fixes the return cost)
  billLineId: text("bill_line_id"),
  batchId: text("batch_id"),
});
