// Labels and links for stock movement sources (shared by server and client).

export const SOURCE_LABELS: Record<string, string> = {
  opening: "Opening stock",
  goods_receipt: "Goods receipt",
  supplier_bill: "Supplier bill",
  purchase_return: "Purchase return",
  sales_invoice: "Sales invoice",
  sales_return: "Sales return",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  adjustment: "Adjustment",
  stock_count: "Stock count",
};

/**
 * Where to open a movement's source document. `kind` is the resolved document type (reversal
 * movements are written as "adjustment" but point at the voided document's id).
 */
export function sourceHref(kind: string, sourceId: string | null | undefined): string | null {
  if (!sourceId) return null;
  switch (kind) {
    case "product":
    case "opening":
      return `/inventory/products/${sourceId}`;
    case "sales_invoice":
      return `/sales/invoices/${sourceId}`;
    case "sales_return":
      return `/sales/returns/${sourceId}`;
    case "goods_receipt":
      return `/purchasing/receipts/${sourceId}`;
    case "supplier_bill":
      return `/purchasing/bills/${sourceId}`;
    case "purchase_return":
      return `/purchasing/returns/${sourceId}`;
    case "transfer_in":
    case "transfer_out":
      return `/inventory/transfers/${sourceId}`;
    case "adjustment":
      return `/inventory/adjustments/${sourceId}`;
    case "stock_count":
      return `/inventory/counts/${sourceId}`;
    default:
      return null;
  }
}
