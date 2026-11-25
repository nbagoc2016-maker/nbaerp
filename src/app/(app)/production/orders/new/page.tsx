import { PageHeader } from "@/components/app/page-header";
import { WorkOrderForm } from "@/components/production/work-order-form";
import { requirePermission } from "@/server/auth";
import { productOptions, warehouseOptions } from "@/server/queries/options";
import { listMachineTypes, listbomandlines } from "@/server/queries/production";

export default async function NewWorkOrderPage() {
  await requirePermission("production.manage");
  const [products, warehouses, bomsAndLines, machineTypes] = await Promise.all([
    productOptions({ mode: "purchase" }),
    warehouseOptions(),
    listbomandlines(),
    listMachineTypes(),
  ]);

  return (
    <>
      <PageHeader
        title="Create Work Order"
        description="Schedule a new manufacturing job and plan component consumption."
        backHref="/production/orders"
      />
      <WorkOrderForm
        products={products}
        warehouses={warehouses.map((w) => ({ id: w.value, name: w.label }))}
        bomsAndLines={bomsAndLines.boms}
        machineTypes={machineTypes}
      />
    </>
  );
}
