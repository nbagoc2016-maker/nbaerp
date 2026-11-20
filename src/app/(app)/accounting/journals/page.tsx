import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { StatCard } from "@/components/app/stat-card";
import { JournalsTable } from "@/components/accounting/journals-table";
import { UrlSelect } from "@/components/accounting/url-filters";
import { fmtAmount } from "@/components/accounting/amount";
import { Button } from "@/components/ui/button";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { listJournals } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { SOURCE_LABELS } from "@/server/services/finance-shared";

export default async function JournalsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; source?: string; status?: string }> }) {
  const user = await requirePermission("accounting.view");
  const sp = await searchParams;
  const period = readPeriod(sp);
  const company = await getCompany();
  const rows = await listJournals({ ...period, source: sp.source, status: sp.status });
  const posted = rows.filter((r) => r.status === "posted");
  const manual = posted.filter((r) => r.sourceType === "manual" || r.sourceType === "opening");
  const voided = rows.length - posted.length;
  const canPost = can(user, "accounting.journal");

  return (
    <>
      <PageHeader
        title="Journal Entries"
        description="Every posting in the books — from documents and manual entries."
        actions={
          canPost ? (
            <Button asChild>
              <Link href="/accounting/journals/new">
                <Plus className="size-4" />
                New journal entry
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Posted entries" value={posted.length} hint="in this period" />
        <StatCard label="Total posted" value={fmtAmount(posted.reduce((s, r) => s + r.total, 0))} />
        <StatCard label="Manual & opening" value={manual.length} hint={fmtAmount(manual.reduce((s, r) => s + r.total, 0))} />
        <StatCard label="Voided" value={voided} tone={voided ? "warning" : "default"} />
      </div>
      <div className="mb-3">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>
      <JournalsTable
        data={rows}
        canPost={canPost}
        toolbar={
          <>
            <UrlSelect
              param="source"
              value={sp.source}
              allLabel="All sources"
              label="Source"
              options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <UrlSelect
              param="status"
              value={sp.status}
              allLabel="Any status"
              label="Status"
              className="w-36"
              options={[
                { value: "posted", label: "Posted" },
                { value: "void", label: "Void" },
              ]}
            />
          </>
        }
      />
    </>
  );
}
