import { PageHeader } from "@/components/app/page-header";
import { ProductForm } from "@/components/inventory/product-form";
import { can, requirePermission } from "@/server/auth";
import { productFormOptions } from "@/server/queries/products";

export default async function NewProductPage() {
  const user = await requirePermission("inventory.manage");
  const options = await productFormOptions();
  return (
    <>
      <PageHeader title="New product" description="Add an item or service, with optional opening stock." backHref="/inventory/products" />
      <ProductForm options={options} canCost={can(user, "inventory.cost")} />
    </>
  );
}
