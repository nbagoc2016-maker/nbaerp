import { today } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { CompanyForm } from "@/components/settings/company-form";
import { LockDateCard, NumberingCard } from "@/components/settings/numbering";
import { requirePermission } from "@/server/auth";
import { listNumberSeries } from "@/server/queries/admin";
import { getCompany } from "@/server/queries/company";

export const metadata = { title: "Company settings" };

export default async function CompanySettingsPage() {
  await requirePermission("settings.company");
  const [c, series] = await Promise.all([getCompany(), listNumberSeries()]);
  const s = (v: string | null | undefined) => v ?? "";

  return (
    <div className="space-y-6">
      <PageHeader className="mb-0" title="Company settings" description="Business profile, document numbering and period closing." />
      <CompanyForm
        canEdit
        initial={{
          name: c.name,
          legalName: s(c.legalName),
          tagline: s(c.tagline),
          address: s(c.address),
          city: s(c.city),
          country: s(c.country),
          phone: s(c.phone),
          email: s(c.email),
          website: s(c.website),
          taxNumber: s(c.taxNumber),
          currency: c.currency,
          currencySymbol: c.currencySymbol,
          fiscalYearStartMonth: c.fiscalYearStartMonth,
          invoiceFooter: s(c.invoiceFooter),
          logoUrl: s(c.logoUrl),
        }}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <NumberingCard series={series} canEdit />
        </div>
        <div className="min-w-0">
          <LockDateCard lockDate={c.lockDate ?? null} canEdit today={today()} />
        </div>
      </div>
    </div>
  );
}
