import { PageHeader } from "@/components/app/page-header";
import { WarehouseForm } from "@/components/inventory/warehouse-forms";
import { requirePermission } from "@/server/auth";

export default async function NewWarehousePage() {
  await requirePermission("inventory.warehouses");
  return (
    <>
      <PageHeader title="New warehouse" description="A store, shop or transit location that holds stock." backHref="/inventory/warehouses" />
      <div className="max-w-4xl">
        <WarehouseForm initial={{ code: "", name: "", type: "warehouse", address: "", phone: "", managerName: "", isDefault: false, isActive: true }} />
      </div>
    </>
  );
}
