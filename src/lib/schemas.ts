// Reusable zod pieces for server actions.
import { z } from "zod";

export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
export const zId = z.string().min(1, "Required");
export const zMoney = z.coerce.number().finite().min(0, "Can't be negative");
export const zQty = z.coerce.number().finite();
export const zOptText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** A document line as sent by LineItemsEditor's toLinePayload() */
export const zDocLine = z.object({
  productId: z.string().nullable(),
  description: z.string().trim().min(1, "Every line needs a description"),
  qty: z.coerce.number().positive("Quantity must be more than zero"),
  price: zMoney,
  discountPct: z.coerce.number().min(0).max(100).default(0),
  taxRate: z.coerce.number().min(0).default(0),
});

export const zDocLines = z.object({
  lines: z.array(zDocLine).min(1, "Add at least one line"),
  documentDiscount: zMoney.default(0),
  charges: zMoney.default(0),
});

export type DocLinesInput = z.infer<typeof zDocLines>;
