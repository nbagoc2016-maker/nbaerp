// Zod input schemas for the Inventory & Warehouse module. No database imports, so server actions,
// services and tests can share them.
import { z } from "zod";
import { zDay, zId, zMoney, zOptText } from "@/lib/schemas";

const optId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const qtyPositive = z.coerce.number().finite().positive("Quantity must be more than zero");
const qtyMin0 = z.coerce.number().finite().min(0, "Can't be negative");

// ---- Products --------------------------------------------------------------------------------

export const zOpeningRoll = z.object({
  batchNo: z.string().trim().min(1, "Roll number is required"),
  qty: qtyPositive,
  shade: zOptText,
});

export const zOpeningRow = z.object({
  warehouseId: zId,
  qty: qtyMin0.default(0),
  unitCost: zMoney.default(0),
  rolls: z.array(zOpeningRoll).default([]),
});

export const productSchema = z.object({
  id: optId,
  sku: z.string().trim().max(60).default(""),
  /** true when the user kept the suggested SKU: the real number is reserved on save */
  skuAuto: z.boolean().default(false),
  barcode: zOptText,
  name: z.string().trim().min(1, "Product name is required").max(200),
  description: zOptText,
  type: z.enum(["stock", "service"]).default("stock"),
  categoryId: optId,
  brandId: optId,
  unitId: zId,
  taxRateId: optId,
  costPrice: zMoney.default(0),
  salePrice: zMoney.default(0),
  minSalePrice: zMoney.default(0),
  wholesalePrice: z.coerce.number().finite().min(0).nullable().optional().transform((v) => (v ? v : null)),
  reorderLevel: qtyMin0.default(0),
  reorderQty: qtyMin0.default(0),
  trackBatches: z.boolean().default(false),
  color: zOptText,
  size: zOptText,
  material: zOptText,
  imageUrl: zOptText,
  isActive: z.boolean().default(true),
  openingDate: zDay.optional(),
  opening: z.array(zOpeningRow).default([]),
});
export type ProductInput = z.infer<typeof productSchema>;

export const productImportRowSchema = z.object({
  sku: z.string().trim().optional().default(""),
  name: z.string().trim().min(1, "Name is required"),
  barcode: z.string().trim().optional().default(""),
  type: z.string().trim().optional().default("stock"),
  category: z.string().trim().optional().default(""),
  brand: z.string().trim().optional().default(""),
  unit: z.string().trim().min(1, "Unit is required"),
  cost: z.coerce.number().finite().min(0).default(0),
  sale: z.coerce.number().finite().min(0).default(0),
  minSale: z.coerce.number().finite().min(0).default(0),
  wholesale: z.coerce.number().finite().min(0).default(0),
  taxRate: z.coerce.number().finite().min(0).default(0),
  reorderLevel: z.coerce.number().finite().min(0).default(0),
  reorderQty: z.coerce.number().finite().min(0).default(0),
  trackBatches: z.boolean().default(false),
  color: z.string().trim().optional().default(""),
  size: z.string().trim().optional().default(""),
  material: z.string().trim().optional().default(""),
  openingQty: z.coerce.number().finite().min(0).default(0),
  openingWarehouse: z.string().trim().optional().default(""),
});
export const productImportSchema = z.object({
  date: zDay,
  rows: z.array(productImportRowSchema).min(1, "Nothing to import").max(5000),
});
export type ProductImportInput = z.infer<typeof productImportSchema>;

// ---- Transfers -------------------------------------------------------------------------------

export const transferSchema = z.object({
  id: optId,
  date: zDay,
  fromWarehouseId: zId,
  toWarehouseId: zId,
  notes: zOptText,
  lines: z
    .array(z.object({ productId: zId, batchId: optId, qty: qtyPositive }))
    .min(1, "Add at least one item"),
});
export type TransferInput = z.infer<typeof transferSchema>;

// ---- Adjustments -----------------------------------------------------------------------------

export const ADJUSTMENT_REASONS = ["damage", "loss", "found", "correction", "sample", "opening", "other"] as const;

export const adjustmentSchema = z.object({
  id: optId,
  date: zDay,
  warehouseId: zId,
  reason: z.enum(ADJUSTMENT_REASONS).default("correction"),
  notes: zOptText,
  lines: z
    .array(
      z.object({
        productId: zId,
        batchId: optId,
        qtyChange: z.coerce
          .number()
          .finite()
          .refine((v) => v !== 0, "Quantity change can't be zero"),
        /** Cost for increases; 0 or empty uses the current average cost */
        unitCost: zMoney.default(0),
        notes: zOptText,
      })
    )
    .min(1, "Add at least one item"),
});
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

// ---- Counts ----------------------------------------------------------------------------------

export const countCreateSchema = z.object({
  date: zDay,
  warehouseId: zId,
  categoryId: optId,
  notes: zOptText,
});
export type CountCreateInput = z.infer<typeof countCreateSchema>;

export const countLinesSchema = z.object({
  id: zId,
  lines: z.array(z.object({ lineId: zId, countedQty: z.number().finite().min(0).nullable() })),
});
export type CountLinesInput = z.infer<typeof countLinesSchema>;

export const voidSchema = z.object({ id: zId, reason: zOptText });
export const idSchema = z.object({ id: zId });

// ---- Warehouses & setup ----------------------------------------------------------------------

export const warehouseSchema = z.object({
  id: optId,
  code: z.string().trim().min(1, "Code is required").max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(120),
  type: z.enum(["warehouse", "shop", "transit"]).default("warehouse"),
  address: zOptText,
  phone: zOptText,
  managerName: zOptText,
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;

export const locationSchema = z.object({
  id: optId,
  warehouseId: zId,
  code: z.string().trim().min(1, "Code is required").max(40).transform((v) => v.toUpperCase()),
  name: zOptText,
  isActive: z.boolean().default(true),
});
export type LocationInput = z.infer<typeof locationSchema>;

export const categorySchema = z.object({
  id: optId,
  name: z.string().trim().min(1, "Name is required").max(120),
  parentId: optId,
  description: zOptText,
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const brandSchema = z.object({ id: optId, name: z.string().trim().min(1, "Name is required").max(120) });
export type BrandInput = z.infer<typeof brandSchema>;

export const unitSchema = z.object({
  id: optId,
  code: z.string().trim().min(1, "Code is required").max(20).transform((v) => v.toLowerCase()),
  name: z.string().trim().min(1, "Name is required").max(60),
  allowFraction: z.boolean().default(false),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const taxRateSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, "Name is required").max(60),
  rate: z.coerce.number().finite().min(0, "Can't be negative").max(100, "Use a percentage up to 100"),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type TaxRateInput = z.infer<typeof taxRateSchema>;
