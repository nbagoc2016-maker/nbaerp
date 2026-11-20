// Input schemas for the purchasing module. Shared by server actions, services and tests.
// Pure (zod + lib only) so client components may import the types and helpers too.
import { z } from "zod";
import { round2 } from "@/lib/format";
import { zDay, zDocLine, zId, zMoney, zOptText } from "@/lib/schemas";

const zOptId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

// ---- Suppliers ------------------------------------------------------------------------------

export const supplierSchema = z.object({
  id: zOptId,
  code: zOptText,
  name: z.string().trim().min(1, "Name is required"),
  contactPerson: zOptText,
  phone: zOptText,
  altPhone: zOptText,
  email: zOptText.refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email"),
  address: zOptText,
  city: zOptText,
  taxNumber: zOptText,
  cnic: zOptText,
  paymentTermsDays: z.coerce.number().int("Whole days only").min(0, "Can't be negative").default(0),
  creditLimit: zMoney.default(0),
  openingBalance: zMoney.default(0),
  openingDate: zDay.optional().nullable(),
  notes: zOptText,
  isActive: z.boolean().default(true),
});
export type SupplierInput = z.input<typeof supplierSchema>;

// ---- Purchase orders ------------------------------------------------------------------------

export const purchaseOrderSchema = z.object({
  id: zOptId,
  date: zDay,
  expectedDate: zDay.optional().nullable(),
  supplierId: zId,
  warehouseId: zId,
  terms: zOptText,
  notes: zOptText,
  lines: z.array(zDocLine).min(1, "Add at least one line"),
  documentDiscount: zMoney.default(0),
  charges: zMoney.default(0),
});
export type PurchaseOrderInput = z.input<typeof purchaseOrderSchema>;

// ---- Goods receipts -------------------------------------------------------------------------

export const grnRollSchema = z.object({
  batchNo: z.string().trim().optional().nullable(),
  qty: z.coerce.number().positive("Roll quantity must be more than zero"),
});

export const grnLineSchema = z.object({
  purchaseOrderLineId: zOptId,
  productId: zId,
  description: z.string().trim().min(1, "Every line needs a description"),
  qty: z.coerce.number().positive("Quantity must be more than zero"),
  unitCost: zMoney,
  /** Rolls / lots for batch-tracked products. Their quantities must add up to the line qty. */
  rolls: z.array(grnRollSchema).default([]),
});

export const goodsReceiptSchema = z.object({
  id: zOptId,
  date: zDay,
  supplierId: zId,
  warehouseId: zId,
  purchaseOrderId: zOptId,
  supplierDeliveryRef: zOptText,
  notes: zOptText,
  lines: z.array(grnLineSchema).min(1, "Add at least one line"),
});
export type GoodsReceiptInput = z.input<typeof goodsReceiptSchema>;

// ---- Supplier bills -------------------------------------------------------------------------

export const billLineSchema = zDocLine.extend({
  goodsReceiptLineId: zOptId,
  purchaseOrderLineId: zOptId,
  expenseAccountId: zOptId,
  batchNo: zOptText,
});

export const supplierBillSchema = z.object({
  id: zOptId,
  date: zDay,
  dueDate: zDay.optional().nullable(),
  supplierId: zId,
  supplierInvoiceNo: zOptText,
  purchaseOrderId: zOptId,
  goodsReceiptId: zOptId,
  warehouseId: zOptId,
  receivesStock: z.boolean().default(false),
  notes: zOptText,
  lines: z.array(billLineSchema).min(1, "Add at least one line"),
  documentDiscount: zMoney.default(0),
  charges: zMoney.default(0),
});
export type SupplierBillInput = z.input<typeof supplierBillSchema>;

// ---- Supplier payments ----------------------------------------------------------------------

export const PAYMENT_METHODS = ["cash", "bank", "cheque", "wallet"] as const;

export const supplierPaymentSchema = z.object({
  date: zDay,
  supplierId: zId,
  method: z.enum(PAYMENT_METHODS).default("bank"),
  paidFromAccountId: zId,
  amount: z.coerce.number().positive("Amount must be more than zero"),
  reference: zOptText,
  notes: zOptText,
  allocations: z
    .array(z.object({ billId: zId, amount: zMoney }))
    .default([])
    .transform((rows) => rows.filter((r) => r.amount > 0)),
});
export type SupplierPaymentInput = z.input<typeof supplierPaymentSchema>;

// ---- Purchase returns -----------------------------------------------------------------------

export const purchaseReturnSchema = z.object({
  id: zOptId,
  date: zDay,
  billId: zId,
  reason: zOptText,
  lines: z
    .array(z.object({ billLineId: zId, qty: z.coerce.number().min(0), batchId: zOptId }))
    .transform((rows) => rows.filter((r) => r.qty > 0))
    .refine((rows) => rows.length > 0, "Enter a quantity to return on at least one line"),
});
export type PurchaseReturnInput = z.input<typeof purchaseReturnSchema>;

export const idSchema = z.object({ id: zId });
export const voidSchema = z.object({ id: zId, reason: zOptText });

// ---- Helpers --------------------------------------------------------------------------------

/** Spread a payment over open bills, oldest due date first. */
export function allocateOldestFirst(
  bills: { id: string; dueDate: string | null; date: string; outstanding: number }[],
  amount: number
): { billId: string; amount: number }[] {
  let left = round2(amount);
  const sorted = [...bills].sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date) || a.date.localeCompare(b.date));
  const out: { billId: string; amount: number }[] = [];
  for (const b of sorted) {
    if (left <= 0) break;
    const take = round2(Math.min(left, b.outstanding));
    if (take > 0) {
      out.push({ billId: b.id, amount: take });
      left = round2(left - take);
    }
  }
  return out;
}
