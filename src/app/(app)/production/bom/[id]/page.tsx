import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { BomForm } from "@/components/production/bom-form";
import { requirePermission } from "@/server/auth";
import { productOptions } from "@/server/queries/options";
import { getBom } from "@/server/queries/production";

export default async function EditBomPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("production.manage");
  const { id } = await params;
  const data = await getBom(id);
  if (!data) notFound();

  const products = await productOptions({ mode: "purchase" });

  return (
    <>
      <PageHeader
        title={`Edit ${data.bom.number}`}
        description={`Bill of materials for ${data.bom.productName}`}
        backHref="/production/bom"
      />
      <BomForm
        products={products}
        initial={{
          id: data.bom.id,
          number: data.bom.number,
          name: data.bom.name,
          productId: data.bom.productId,
          outputQty: data.bom.outputQty,
          laborCost: data.bom.laborCost,
          overheadCost: data.bom.overheadCost,
          notes: data.bom.notes,
          isActive: data.bom.isActive,
          lines: data.lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            scrapPct: l.scrapPct,
            notes: l.notes,
          })),
        }}
      />
    </>
  );
}
