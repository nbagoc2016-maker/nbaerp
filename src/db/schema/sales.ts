import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, day, id, money, qty, updatedAt } from "./_helpers";
import { users } from "./core";
import { customers, products, warehouses } from "./masters";

// Columns shared by every sales document line
const lineColumns = () => ({
  id: id(),
  lineNo: integer("line_no").notNull().default(0),
  productId: text("product_id").references(() => products.id),
  description: text("description").notNull(),
  qty: qty("qty").notNull(),
  unitPrice: money("unit_price").notNull(),
  discountPct: money("discount_pct").notNull().default(0),
  discountAmount: money("discount_amount").notNull().default(0),
  taxRate: money("tax_rate").notNull().default(0),
  taxAmount: money("tax_amount").notNull().default(0),
  lineTotal: money("line_total").notNull(), // after discount, including tax
});

// Columns shared by every sales document header
const totalsColumns = () => ({
  subtotal: money("subtotal").notNull().default(0), // sum of qty * price before discounts
  discountTotal: money("discount_total").notNull().default(0), // line discounts + document discount
  documentDiscount: money("document_discount").notNull().default(0),
  taxTotal: money("tax_total").notNull().default(0),
  shippingCharges: money("shipping_charges").notNull().default(0),
  roundOff: money("round_off").notNull().default(0),
  total: money("total").notNull().default(0),
});

export const quotations = pgTable("quotations", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  validUntil: day("valid_until"),
  customerId: text("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  status: text("status", { enum: ["draft", "sent", "accepted", "rejected", "expired", "converted"] })
    .notNull()
    .default("draft"),
  ...totalsColumns(),
  terms: text("terms"),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const quotationLines = pgTable("quotation_lines", {
  ...lineColumns(),
  quotationId: text("quotation_id")
    .notNull()
    .references(() => quotations.id, { onDelete: "cascade" }),
});

export const salesOrders = pgTable("sales_orders", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  deliveryDate: day("delivery_date"),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  warehouseId: text("warehouse_id").references(() => warehouses.id),
  quotationId: text("quotation_id"),
  status: text("status", { enum: ["draft", "confirmed", "partial", "fulfilled", "cancelled"] })
    .notNull()
    .default("draft"),
  ...totalsColumns(),
  advanceAmount: money("advance_amount").notNull().default(0),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const salesOrderLines = pgTable("sales_order_lines", {
  ...lineColumns(),
  orderId: text("order_id")
    .notNull()
    .references(() => salesOrders.id, { onDelete: "cascade" }),
  invoicedQty: qty("invoiced_qty").notNull().default(0),
});

export const salesInvoices = pgTable(
  "sales_invoices",
  {
    id: id(),
    number: text("number").notNull().unique(),
    date: day("date").notNull(),
    dueDate: day("due_date"),
    channel: text("channel", { enum: ["pos", "invoice"] }).notNull().default("invoice"),
    customerId: text("customer_id").references(() => customers.id), // null = walk-in
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    salesOrderId: text("sales_order_id"),
    salesperson: text("salesperson"),
    status: text("status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
    paymentStatus: text("payment_status", { enum: ["unpaid", "partial", "paid"] }).notNull().default("unpaid"),
    ...totalsColumns(),
    amountPaid: money("amount_paid").notNull().default(0),
    costTotal: money("cost_total").notNull().default(0), // COGS at posting, for margin reports
    notes: text("notes"),
    journalEntryId: text("journal_entry_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("si_date_idx").on(t.date), index("si_customer_idx").on(t.customerId)]
);

export const salesInvoiceLines = pgTable("sales_invoice_lines", {
  ...lineColumns(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => salesInvoices.id, { onDelete: "cascade" }),
  batchId: text("batch_id"),
  unitCost: money("unit_cost").notNull().default(0), // moving-average cost at sale
  returnedQty: qty("returned_qty").notNull().default(0),
});

export const customerReceipts = pgTable(
  "customer_receipts",
  {
    id: id(),
    number: text("number").notNull().unique(),
    date: day("date").notNull(),
    customerId: text("customer_id").references(() => customers.id), // null for walk-in POS payments
    method: text("method", { enum: ["cash", "bank", "card", "cheque", "wallet"] }).notNull().default("cash"),
    depositAccountId: text("deposit_account_id").notNull(), // cash/bank GL account
    amount: money("amount").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    status: text("status", { enum: ["posted", "void"] }).notNull().default("posted"),
    journalEntryId: text("journal_entry_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("cr_customer_idx").on(t.customerId)]
);

export const receiptAllocations = pgTable("receipt_allocations", {
  id: id(),
  receiptId: text("receipt_id")
    .notNull()
    .references(() => customerReceipts.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => salesInvoices.id),
  amount: money("amount").notNull(),
});

export const salesReturns = pgTable("sales_returns", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  invoiceId: text("invoice_id").references(() => salesInvoices.id),
  customerId: text("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  // credit: reduce what the customer owes; refund: pay money back from refundAccountId
  settlement: text("settlement", { enum: ["credit", "refund"] }).notNull().default("credit"),
  refundAccountId: text("refund_account_id"),
  reason: text("reason"),
  status: text("status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
  ...totalsColumns(),
  costTotal: money("cost_total").notNull().default(0),
  journalEntryId: text("journal_entry_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const salesReturnLines = pgTable("sales_return_lines", {
  ...lineColumns(),
  returnId: text("return_id")
    .notNull()
    .references(() => salesReturns.id, { onDelete: "cascade" }),
  invoiceLineId: text("invoice_line_id"),
  unitCost: money("unit_cost").notNull().default(0),
});
