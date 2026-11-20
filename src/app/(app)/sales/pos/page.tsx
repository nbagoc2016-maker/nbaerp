import { PosTerminal } from "@/components/sales/pos/pos-terminal";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { customerOptions } from "@/server/queries/options";
import { paymentAccounts } from "@/server/queries/sales";
import { posCatalog } from "@/server/queries/sales-pos";

export default async function PosPage() {
  const user = await requirePermission("sales.pos");
  const [catalog, customers, accounts, company] = await Promise.all([posCatalog(), customerOptions(), paymentAccounts(), getCompany()]);
  // A counter usually sells from a shop; fall back to the default warehouse
  const defaultWarehouse =
    catalog.warehouses.find((w) => w.type === "shop") ?? catalog.warehouses.find((w) => w.isDefault) ?? catalog.warehouses[0] ?? null;

  return (
    <PosTerminal
      products={catalog.products}
      categories={catalog.categories}
      warehouses={catalog.warehouses}
      defaultWarehouseId={defaultWarehouse?.id ?? null}
      customers={customers.map((c) => ({ value: c.value, label: c.label, hint: c.hint, keywords: c.keywords, priceLevel: c.priceLevel, phone: c.phone }))}
      accounts={accounts.map((a) => ({ value: a.value, label: a.label, subtype: a.subtype }))}
      company={{
        name: company.name,
        address: company.address,
        city: company.city,
        phone: company.phone,
        taxNumber: company.taxNumber,
        invoiceFooter: company.invoiceFooter,
      }}
      cashier={user.name}
      canDiscount={can(user, "sales.discount")}
      canAddCustomer={can(user, ["parties.manage", "sales.pos"])}
    />
  );
}
