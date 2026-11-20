// Server-safe builders for LineItemsEditor values (the editor module itself is client-only).
import type { DocLine, DocLinesValue } from "@/components/app/line-items-editor";
import type { PrintLine } from "@/components/app/print-document";

export const blankLine = (): DocLine => ({
  key: crypto.randomUUID(),
  productId: null,
  description: "",
  qty: 1,
  price: 0,
  discountPct: 0,
  taxRate: 0,
});

export function docLinesValue(
  lines: { productId: string | null; description: string; qty: number; price: number; discountPct?: number; taxRate?: number; key?: string }[],
  opts: { documentDiscount?: number; charges?: number } = {}
): DocLinesValue {
  return {
    lines: lines.length
      ? lines.map((l) => ({
          key: l.key ?? crypto.randomUUID(),
          productId: l.productId,
          description: l.description,
          qty: l.qty,
          price: l.price,
          discountPct: l.discountPct ?? 0,
          taxRate: l.taxRate ?? 0,
        }))
      : [blankLine()],
    documentDiscount: opts.documentDiscount ?? 0,
    charges: opts.charges ?? 0,
  };
}

/** Stored document line -> PrintDocument line. */
export function printLine(l: {
  description: string;
  sku?: string | null;
  unit?: string | null;
  qty: number;
  unitCost: number;
  discountAmount?: number;
  taxAmount?: number;
  lineTotal: number;
}): PrintLine {
  return {
    description: l.description,
    sku: l.sku,
    unit: l.unit,
    qty: l.qty,
    price: l.unitCost,
    discountAmount: l.discountAmount,
    taxAmount: l.taxAmount,
    lineTotal: l.lineTotal,
  };
}

/** Totals block for PrintDocument from a document's stored totals. */
export function printTotals(d: { subtotal: number; discountTotal: number; taxTotal: number; freightCharges: number; total: number }, extra: { label: string; value: number; strong?: boolean }[] = []) {
  return [
    { label: "Subtotal", value: d.subtotal },
    ...(d.discountTotal ? [{ label: "Discount", value: -d.discountTotal }] : []),
    ...(d.taxTotal ? [{ label: "Tax", value: d.taxTotal }] : []),
    ...(d.freightCharges ? [{ label: "Freight", value: d.freightCharges }] : []),
    { label: "Total", value: d.total, strong: true },
    ...extra,
  ];
}

const METHOD_LABEL: Record<string, string> = { cash: "Cash", bank: "Bank transfer", cheque: "Cheque", wallet: "Mobile wallet" };
export const paymentMethodLabel = (m: string) => METHOD_LABEL[m] ?? m;
