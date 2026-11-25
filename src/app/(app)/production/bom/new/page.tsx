import { PageHeader } from "@/components/app/page-header";
import { BomForm } from "@/components/production/bom-form";
import { requirePermission } from "@/server/auth";
import { productOptions } from "@/server/queries/options";

export default async function NewBomPage() {
  await requirePermission("production.manage");
  const products = await productOptions({ mode: "purchase" });

  return (
    <>
      <PageHeader
        title="Create Bill of Materials"
        description="Define a new recipe of components and overhead costs for a manufactured item."
        backHref="/production/bom"
      />
      <BomForm products={products} />
    </>
  );
}
