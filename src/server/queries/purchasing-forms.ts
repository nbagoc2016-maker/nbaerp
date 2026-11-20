import "server-only";
import { formatDate } from "@/lib/format";
import type { ComboOption } from "@/components/app/combobox";
import { accountOptions, productOptions, supplierOptions, warehouseOptions } from "./options";
import { productFlags, receivableOrders, returnableBills, unbilledReceipts } from "./purchasing";

/** Lookups shared by the purchasing editors. */
export async function purchaseFormLookups() {
  const [suppliers, warehouses, products, flags] = await Promise.all([supplierOptions(), warehouseOptions(), productOptions({ mode: "purchase" }), productFlags()]);
  return {
    suppliers,
    warehouses,
    products: products.map((p) => ({ ...p, trackBatches: flags[p.id]?.trackBatches ?? false })),
  };
}

export async function receivableOrderOptions(): Promise<ComboOption[]> {
  const rows = await receivableOrders();
  return rows.map((r) => ({ value: r.id, label: `${r.number} · ${r.supplierName}`, hint: formatDate(r.date) }));
}

export async function unbilledReceiptOptions(): Promise<(ComboOption & { supplierId: string })[]> {
  const rows = await unbilledReceipts();
  return rows.map((r) => ({ value: r.id, label: `${r.number} · ${r.supplierName}`, hint: formatDate(r.date), supplierId: r.supplierId }));
}

export async function returnableBillOptions(): Promise<ComboOption[]> {
  const rows = await returnableBills();
  return rows.map((r) => ({ value: r.id, label: `${r.number} · ${r.supplierName}`, hint: formatDate(r.date) }));
}

/** Accounts a non-stock bill line can be charged to (expenses, plus assets such as fixed assets / prepayments). */
export async function billAccountOptions() {
  const rows = await accountOptions(["expense", "asset"]);
  return rows;
}
