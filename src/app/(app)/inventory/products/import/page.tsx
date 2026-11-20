import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/app/page-header";
import { ProductImport } from "@/components/inventory/product-import";
import { db } from "@/db";
import { units, warehouses } from "@/db/schema";
import { can, requirePermission } from "@/server/auth";

export default async function ImportProductsPage() {
  const user = await requirePermission("inventory.manage");
  const [u, w] = await Promise.all([db.select().from(units).orderBy(asc(units.code)), db.select().from(warehouses).orderBy(asc(warehouses.code))]);
  return (
    <>
      <PageHeader title="Import products" description="Bring in your item list from a spreadsheet. Preview before anything is saved." backHref="/inventory/products" />
      <ProductImport unitCodes={u.map((x) => x.code)} warehouseCodes={w.filter((x) => x.isActive).map((x) => x.code)} canCost={can(user, "inventory.cost")} />
    </>
  );
}
