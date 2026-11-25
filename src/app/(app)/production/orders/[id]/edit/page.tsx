import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { WorkOrderForm } from "@/components/production/work-order-form";
import { requirePermission } from "@/server/auth";
import { productOptions, warehouseOptions } from "@/server/queries/options";
import { getWorkOrder, listMachineTypes, listbomandlines } from "@/server/queries/production";

export default async function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("production.manage");
  const { id } = await params;
  const data = await getWorkOrder(id);
  if (!data) notFound();

  const [products, warehouses, bomsAndLines, machineTypes] = await Promise.all([
    productOptions({ mode: "purchase" }),
    warehouseOptions(),
    listbomandlines(),
    listMachineTypes(),
  ]);

  return (
    <>
      <PageHeader
        title={`Edit ${data.order.number}`}
        description={`Production of ${data.order.productName}`}
        backHref={`/production/orders/${id}`}
      />
      <WorkOrderForm
        products={products}
        warehouses={warehouses.map((w) => ({ id: w.value, name: w.label }))}
        bomsAndLines={bomsAndLines.boms}
        machineTypes={machineTypes}
        initial={{
          id: data.order.id,
          number: data.order.number,
          date: data.order.date,
          dueDate: data.order.dueDate,
          bomId: data.order.bomId,
          productId: data.order.productId,
          targetQty: data.order.targetQty,
          warehouseId: data.order.warehouseId,
          machineTypeId: data.order.machineTypeId,
          laborCost: data.order.laborCost,
          overheadCost: data.order.overheadCost,
          notes: data.order.notes,
          lines: data.lines.map((l) => ({
            productId: l.productId,
            plannedQty: l.plannedQty,
            actualQty: l.actualQty,
            notes: l.notes,
          })),
        }}
      />
    </>
  );
}
