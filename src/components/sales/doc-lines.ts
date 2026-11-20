import type { DocLinesValue } from "@/components/app/line-items-editor";

/** Stored document lines -> LineItemsEditor value (used by edit pages on the server). */
export function toDocLines(
  lines: { id: string; productId: string | null; description: string; qty: number; unitPrice: number; discountPct: number; taxRate: number }[],
  documentDiscount: number,
  charges: number
): DocLinesValue {
  return {
    documentDiscount,
    charges,
    lines: lines.map((l) => ({
      key: l.id,
      productId: l.productId,
      description: l.description,
      qty: l.qty,
      price: l.unitPrice,
      discountPct: l.discountPct,
      taxRate: l.taxRate,
    })),
  };
}

export function blankDocLines(): DocLinesValue {
  return { documentDiscount: 0, charges: 0, lines: [{ key: "line-1", productId: null, description: "", qty: 1, price: 0, discountPct: 0, taxRate: 0 }] };
}
