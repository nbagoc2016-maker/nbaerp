import Link from "next/link";
import { Coins, Package, PackageX, Plus, TriangleAlert, Upload } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ProductsTable } from "@/components/inventory/products-table";
import { stockState } from "@/components/inventory/shared";
import { Button } from "@/components/ui/button";
import { formatMoney, formatNumber } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { categoryTree, listProducts } from "@/server/queries/products";
import { db } from "@/db";
import { brands as brandsTable } from "@/db/schema";
import { asc } from "drizzle-orm";

export default async function ProductsPage() {
  const user = await requirePermission("inventory.view");
  const canCost = can(user, "inventory.cost");
  const canManage = can(user, "inventory.manage");
  const [products, categories, brands] = await Promise.all([listProducts(), categoryTree(), db.select().from(brandsTable).orderBy(asc(brandsTable.name))]);

  const active = products.filter((p) => p.isActive);
  const stock = active.filter((p) => p.type === "stock");
  const low = stock.filter((p) => stockState(p.onHand, p.reorderLevel) === "low").length;
  const out = stock.filter((p) => stockState(p.onHand, p.reorderLevel) === "out").length;
  const value = products.reduce((t, p) => t + p.value, 0);

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything you buy, stock and sell, with live quantities and prices."
        actions={
          canManage && (
            <>
              <Button asChild variant="outline">
                <Link href="/inventory/products/import">
                  <Upload className="size-4" />
                  Import CSV
                </Link>
              </Button>
              <Button asChild>
                <Link href="/inventory/products/new">
                  <Plus className="size-4" />
                  New product
                </Link>
              </Button>
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active SKUs" value={formatNumber(active.length)} hint={`${stock.length} stocked · ${active.length - stock.length} services`} icon={Package} />
        {canCost ? (
          <StatCard label="Stock value" value={formatMoney(value)} hint="At moving-average cost" icon={Coins} tone="info" />
        ) : (
          <StatCard label="Inactive" value={formatNumber(products.length - active.length)} hint="Hidden from sales and purchases" icon={Package} tone="info" />
        )}
        <StatCard label="Low stock" value={formatNumber(low)} hint="At or below reorder level" icon={TriangleAlert} tone="warning" />
        <StatCard label="Out of stock" value={formatNumber(out)} hint="Nothing left in any warehouse" icon={PackageX} tone="danger" />
      </div>
      <ProductsTable
        data={products.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          barcode: p.barcode,
          imageUrl: p.imageUrl,
          type: p.type,
          categoryId: p.categoryId,
          category: p.category,
          brandId: p.brandId,
          brand: p.brand,
          unit: p.unit,
          salePrice: p.salePrice,
          reorderLevel: p.reorderLevel,
          trackBatches: p.trackBatches,
          isActive: p.isActive,
          onHand: p.onHand,
          value: canCost ? p.value : null, // cost data never leaves the server without permission
        }))}
        canCost={canCost}
        canManage={canManage}
        categories={categories.map((c) => ({ value: c.id, label: c.path }))}
        brands={brands.map((b) => ({ value: b.id, label: b.name }))}
      />
    </>
  );
}
