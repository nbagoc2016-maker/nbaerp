// Validation schemas and pure helpers for the Sales module. No server-only imports, so client
// components can share the same types and the FIFO allocation logic.
import { z } from "zod";
import { round2 } from "@/lib/format";
import { zDay, zDocLine, zDocLines, zId, zMoney, zOptText } from "@/lib/schemas";

const zOptId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const zOptDay = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date");

// ---- Customers -------------------------------------------------------------------------------

export const zCustomer = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(["retail", "wholesale", "corporate"]).default("retail"),
  priceLevel: z.enum(["retail", "wholesale"]).default("retail"),
  contactPerson: zOptText,
  phone: zOptText,
  altPhone: zOptText,
  email: zOptText.refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"),
  address: zOptText,
  city: zOptText,
  taxNumber: zOptText,
  cnic: zOptText,
  paymentTermsDays: z.coerce.number().int("Whole days only").min(0, "Can't be negative").default(0),
  creditLimit: zMoney.default(0),
  openingBalance: zMoney.default(0),
  openingDate: zOptDay,
  notes: zOptText,
  isActive: z.boolean().default(true),
});
export type CustomerInput = z.infer<typeof zCustomer>;

// ---- Quotations / orders / invoices -----------------------------------------------------------

export const zQuotation = zDocLines.extend({
  id: z.string().optional(),
  date: zDay,
  validUntil: zOptDay,
  customerId: zOptId,
  customerName: zOptText,
  terms: zOptText,
  notes: zOptText,
});
export type QuotationInput = z.infer<typeof zQuotation>;

export const zOrder = zDocLines.extend({
  id: z.string().optional(),
  date: zDay,
  deliveryDate: zOptDay,
  customerId: zId,
  warehouseId: zOptId,
  quotationId: zOptId,
  notes: zOptText,
  confirm: z.boolean().default(false),
});
export type OrderInput = z.infer<typeof zOrder>;

export const zInvoice = zDocLines.extend({
  id: z.string().optional(),
  date: zDay,
  dueDate: zOptDay,
  customerId: zOptId,
  customerName: zOptText,
  customerPhone: zOptText,
  warehouseId: zId,
  salesOrderId: zOptId,
  salesperson: zOptText,
  notes: zOptText,
  post: z.boolean().default(false),
});
export type InvoiceInput = z.infer<typeof zInvoice>;

export const zOrderToInvoice = z.object({
  orderId: zId,
  date: zDay,
  warehouseId: zOptId,
  lines: z
    .array(z.object({ orderLineId: zId, qty: z.coerce.number().min(0) }))
    .min(1, "Pick at least one line"),
});
export type OrderToInvoiceInput = z.infer<typeof zOrderToInvoice>;

// ---- Receipts ---------------------------------------------------------------------------------

export const RECEIPT_METHODS = ["cash", "bank", "card", "cheque", "wallet"] as const;

export const zReceipt = z.object({
  date: zDay,
  customerId: zOptId,
  method: z.enum(RECEIPT_METHODS).default("cash"),
  depositAccountId: zId,
  amount: z.coerce.number().positive("Amount must be more than zero"),
  reference: zOptText,
  notes: zOptText,
  allocations: z.array(z.object({ invoiceId: zId, amount: zMoney })).default([]),
});
export type ReceiptInput = z.infer<typeof zReceipt>;

// ---- Returns ----------------------------------------------------------------------------------

export const zReturn = z.object({
  invoiceId: zId,
  date: zDay,
  settlement: z.enum(["credit", "refund"]).default("credit"),
  refundAccountId: zOptId,
  reason: zOptText,
  lines: z.array(z.object({ invoiceLineId: zId, qty: z.coerce.number().min(0) })).min(1, "Pick at least one line"),
  post: z.boolean().default(true),
});
export type ReturnInput = z.infer<typeof zReturn>;

// ---- POS --------------------------------------------------------------------------------------

export const zPosPayment = z.object({
  method: z.enum(["cash", "card", "bank", "wallet"]),
  accountId: zId,
  amount: zMoney,
  reference: zOptText,
});

export const zPosSale = z.object({
  date: zDay.optional(),
  customerId: zOptId,
  customerName: zOptText,
  customerPhone: zOptText,
  warehouseId: zId,
  lines: z.array(zDocLine).min(1, "The cart is empty"),
  documentDiscount: zMoney.default(0),
  payments: z.array(zPosPayment).default([]),
  /** Cash handed over by the customer (may exceed the cash part; the difference is change) */
  tendered: zMoney.optional(),
  notes: zOptText,
});
export type PosSaleInput = z.infer<typeof zPosSale>;

// ---- Helpers ----------------------------------------------------------------------------------

/** Spread an amount over open invoices oldest first. Returns invoiceId -> amount. */
export function fifoAllocate(invoices: { id: string; outstanding: number }[], amount: number): Record<string, number> {
  const out: Record<string, number> = {};
  let left = round2(amount);
  for (const inv of invoices) {
    if (left <= 0) break;
    const take = round2(Math.min(left, inv.outstanding));
    if (take > 0) {
      out[inv.id] = take;
      left = round2(left - take);
    }
  }
  return out;
}

/**
 * Value of returning `qty` of an invoice line: the line's net (after line and bill discount) and
 * tax, pro rata, so a return credits exactly what was charged.
 */
export function returnLineValue(line: { qty: number; taxAmount: number; lineTotal: number }, qty: number) {
  const ratio = line.qty ? qty / line.qty : 0;
  const lineNet = round2(line.lineTotal - line.taxAmount);
  const net = round2(lineNet * ratio);
  const tax = round2(line.taxAmount * ratio);
  return { net, tax, total: round2(net + tax) };
}

export function paymentStatusFor(total: number, paid: number): "unpaid" | "partial" | "paid" {
  if (paid >= total - 0.005) return "paid";
  if (paid > 0.005) return "partial";
  return "unpaid";
}

export const WALK_IN = "__walkin__";
