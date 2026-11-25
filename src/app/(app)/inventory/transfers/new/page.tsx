import { PageHeader } from "@/components/app/page-header";
import { TransferForm } from "@/components/inventory/stock-doc-forms";
import { today } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { docFormData } from "@/server/queries/inventory";

export default async function NewTransferPage({ searchParams }: { searchParams: Promise<{ product?: string; from?: string; to?: string; intent?: string }> }) {
  const user = await requirePermission("inventory.transfer");
  const sp = await searchParams;
  const data = await docFormData(can(user, "inventory.cost"));
  const def = data.warehouses.find((w) => w.isDefault) ?? data.warehouses[0];

  // Auto-detect production and dispatch warehouses if user chose an intent
  let preFrom = sp.from;
  let preTo = sp.to;
  let pageTitle = "New stock transfer";
  let pageDesc = "Pick the source and destination, then the items to move.";
  let defaultNotes = "";

  if (sp.intent === "issue") {
    pageTitle = "Issue Stock to Production";
    pageDesc = "Transfer raw materials and stock from main warehouse to production floor.";
    defaultNotes = "Stock issued to production area";
    const prodWh = data.warehouses.find((w) => w.label === "production_hall");
    const mainWh = data.warehouses.find((w) => w.label === "warehouse" || w.label === "gate_area");
    if (mainWh) preFrom = mainWh.value;
    if (prodWh) preTo = prodWh.value;
  } else if (sp.intent === "dispatch") {
    pageTitle = "Dispatch Finished Goods";
    pageDesc = "Send finished goods from production area to dispatch / staging warehouse.";
    defaultNotes = "Finished goods dispatched from production";
    const prodWh = data.warehouses.find((w) => w.label === "production_hall");
    const dispWh = data.warehouses.find((w) => w.label === "dispatch_area");
    if (prodWh) preFrom = prodWh.value;
    if (dispWh) preTo = dispWh.value;
  }

  const from = data.warehouses.find((w) => w.value === preFrom) ?? def;
  const to = data.warehouses.find((w) => w.value === preTo) ?? data.warehouses.find((w) => w.value !== from?.value);
  const product = data.products.find((p) => p.id === sp.product);

  return (
    <>
      <PageHeader title={pageTitle} description={pageDesc} backHref="/inventory/transfers" />
      <TransferForm
        data={data}
        initial={{
          date: today(),
          fromWarehouseId: from?.value ?? "",
          toWarehouseId: to?.value ?? "",
          notes: defaultNotes,
          lines: product ? [{ productId: product.id, batchId: null, qty: 1 }] : [],
        }}
      />
    </>
  );
}
