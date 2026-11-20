import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { HrSetupSheet } from "@/components/hr/hr-setup-sheet";
import { LeaveBalancesTable } from "@/components/hr/leave-balances";
import { LeaveTable } from "@/components/hr/leave-table";
import { SegmentLinks } from "@/components/hr/segment-links";
import { Button } from "@/components/ui/button";
import { today } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { departmentsWithCounts, leaveBalanceTable, leaveCounts, listLeaveRequests, listLeaveTypes } from "@/server/queries/hr";

const STATUSES = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
] as const;

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ status?: string; tab?: string; year?: string }> }) {
  const user = await requirePermission(["hr.attendance", "hr.view"]);
  const sp = await searchParams;
  const tab = sp.tab === "balances" ? "balances" : "requests";
  const status = STATUSES.find((s) => s.key === sp.status)?.key ?? "pending";
  const thisYear = Number(today().slice(0, 4));
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : thisYear;
  const canDecide = can(user, "hr.attendance");
  const canCreate = can(user, ["hr.attendance", "hr.manage"]);

  const newButton = canCreate && (
    <Button asChild size="sm">
      <Link href="/hr/leave/new">
        <Plus className="size-4" />
        New request
      </Link>
    </Button>
  );

  const tabs = (
    <SegmentLinks
      items={[
        { label: "Requests", href: `/hr/leave?status=${status}`, active: tab === "requests" },
        { label: "Balances", href: `/hr/leave?tab=balances&year=${year}`, active: tab === "balances" },
      ]}
    />
  );

  const header = (
    <PageHeader
      title="Leave"
      description="Requests, approvals and how much leave everyone has left this year."
      actions={
        <>
          {can(user, "hr.manage") && <HrSetupSheet departments={await departmentsWithCounts()} leaveTypes={await listLeaveTypes()} defaultTab="leave" />}
          {newButton}
        </>
      }
    />
  );

  if (tab === "balances") {
    const data = await leaveBalanceTable(year);
    return (
      <>
        {header}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {tabs}
          <SegmentLinks
            items={[thisYear - 1, thisYear, thisYear + 1].map((y) => ({ label: String(y), href: `/hr/leave?tab=balances&year=${y}`, active: y === year }))}
          />
        </div>
        <LeaveBalancesTable data={data} />
      </>
    );
  }

  const [rows, counts] = await Promise.all([listLeaveRequests({ status: status === "all" ? undefined : status }), leaveCounts()]);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {tabs}
        <SegmentLinks
          items={STATUSES.map((s) => ({
            label: s.label,
            href: `/hr/leave?status=${s.key}`,
            active: s.key === status,
            count: s.key === "all" ? total : (counts[s.key] ?? 0),
          }))}
        />
      </div>
      <LeaveTable data={rows} canDecide={canDecide} emptyAction={status === "pending" || status === "all" ? newButton || undefined : undefined} />
    </>
  );
}
