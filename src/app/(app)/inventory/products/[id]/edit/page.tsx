import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ProductForm } from "@/components/inventory/product-form";
import { can, requirePermission } from "@/server/auth";
import { getProduct, productFormOptions } from "@/server/queries/products";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory.manage");
  const { id } = await params;
  const [p, options] = await Promise.all([getProduct(id), productFormOptions()]);
  if (!p) notFound();
  const canCost = can(user, "inventory.cost");
  return (
    <>
      <PageHeader title={`Edit ${p.name}`} description={p.sku} backHref={`/inventory/products/${p.id}`} />
      <ProductForm
        canCost={canCost}
        options={options}
        initial={{
          id: p.id,
          sku: p.sku,
          barcode: p.barcode ?? "",
          name: p.name,
          description: p.description ?? "",
          type: p.type,
          categoryId: p.categoryId,
          brandId: p.brandId,
          unitId: p.unitId,
          taxRateId: p.taxRateId,
          costPrice: canCost ? p.costPrice : 0,
          salePrice: p.salePrice,
          minSalePrice: p.minSalePrice,
          wholesalePrice: p.wholesalePrice ?? 0,
          reorderLevel: p.reorderLevel,
          reorderQty: p.reorderQty,
          trackBatches: p.trackBatches,
          color: p.color ?? "",
          size: p.size ?? "",
          material: p.material ?? "",
          imageUrl: p.imageUrl ?? "",
          isActive: p.isActive,
        }}
      />
    </>
  );
}
