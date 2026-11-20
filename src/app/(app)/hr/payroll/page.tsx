import Link from "next/link";
import { CalendarClock, FileSpreadsheet, Play, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { PayrollRunsTable } from "@/components/hr/payroll-runs-table";
import { Button } from "@/components/ui/button";
import { formatMoney, round2, today } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { listPayrollRuns } from "@/server/queries/hr";

export default async function PayrollPage() {
  await requirePermission("hr.payroll");
  const runs = await listPayrollRuns();
  const posted = runs.filter((r) => r.status === "posted");
  const last = posted[0];
  const unpaid = round2(posted.reduce((s, r) => s + r.totalNet - r.totalPaid, 0));
  const drafts = runs.filter((r) => r.status === "draft");
  const year = today().slice(0, 4);
  const ytd = round2(posted.filter((r) => r.period.startsWith(year)).reduce((s, r) => s + r.totalGross, 0));

  const runButton = (
    <Button asChild size="sm">
      <Link href="/hr/payroll/new">
        <Play className="size-4" />
        Run payroll
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title="Payroll" description="Monthly salary runs: calculate, review, post to the books and pay." actions={runButton} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Last posted payroll" value={last ? formatMoney(last.totalNet) : "—"} icon={FileSpreadsheet} hint={last ? `Net pay · ${last.periodLabel}` : "Nothing posted yet"} />
        <StatCard label="Salaries still to pay" value={formatMoney(unpaid)} icon={Wallet} tone={unpaid > 0 ? "danger" : "success"} hint="Posted but unpaid" />
        <StatCard label={`Gross salaries ${year}`} value={formatMoney(ytd)} icon={FileSpreadsheet} tone="info" hint="Posted runs this calendar year" />
        <StatCard
          label="Drafts"
          value={drafts.length}
          icon={CalendarClock}
          tone="warning"
          hint={drafts.length ? `${drafts.map((d) => d.periodLabel).join(", ")} waiting to be posted` : "No drafts waiting"}
        />
      </div>
      <PayrollRunsTable data={runs} emptyAction={runButton} />
    </>
  );
}
