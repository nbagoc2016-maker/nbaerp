import { PageHeader } from "@/components/app/page-header";
import { SetupTabs } from "@/components/inventory/setup-tabs";
import { requirePermission } from "@/server/auth";
import { setupData } from "@/server/queries/inventory";

const TABS = ["categories", "brands", "units", "tax"];

export default async function InventorySetupPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("inventory.manage");
  const sp = await searchParams;
  const data = await setupData();
  return (
    <>
      <PageHeader title="Categories & units" description="The lists your products are built from: categories, brands, units of measure and tax rates." />
      <SetupTabs data={data} initialTab={TABS.includes(sp.tab ?? "") ? sp.tab! : "categories"} />
    </>
  );
}
