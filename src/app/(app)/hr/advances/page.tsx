import Link from "next/link";
import { CheckCircle2, HandCoins, Landmark, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { AdvancesTable } from "@/components/hr/advances-table";
import { SegmentLinks } from "@/components/hr/segment-links";
import { Button } from "@/components/ui/button";
import { formatMoney, round2 } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { listAdvances } from "@/server/queries/hr";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "settled", label: "Settled" },
  { key: "void", label: "Void" },
  { key: "all", label: "All" },
] as const;

export default async function AdvancesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("hr.payroll");
  const sp = await searchParams;
  const status = FILTERS.find((f) => f.key === sp.status)?.key ?? "open";
  const all = await listAdvances();
  const rows = status === "all" ? all : all.filter((a) => a.status === status);
  const open = all.filter((a) => a.status === "open");
  const outstanding = round2(open.reduce((s, a) => s + a.balance, 0));
  const nextRecovery = round2(open.reduce((s, a) => s + Math.min(a.installmentAmount, a.balance), 0));
  const recovered = round2(all.filter((a) => a.status !== "void").reduce((s, a) => s + a.amount - a.balance, 0));

  const newButton = (
    <Button asChild size="sm">
      <Link href="/hr/advances/new">
        <Plus className="size-4" />
        Pay advance
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title="Advances & loans" description="Money paid to staff ahead of salary, recovered automatically through payroll." actions={newButton} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding" value={formatMoney(outstanding)} icon={HandCoins} tone="warning" hint={`${open.length} open advance${open.length === 1 ? "" : "s"} / loans`} />
        <StatCard label="Due next payroll" value={formatMoney(nextRecovery)} icon={Landmark} tone="info" hint="Sum of installments" />
        <StatCard label="Recovered to date" value={formatMoney(recovered)} icon={CheckCircle2} tone="success" />
      </div>
      <div className="mb-4">
        <SegmentLinks
          items={FILTERS.map((f) => ({
            label: f.label,
            href: `/hr/advances?status=${f.key}`,
            active: f.key === status,
            count: f.key === "all" ? all.length : all.filter((a) => a.status === f.key).length,
          }))}
        />
      </div>
      <AdvancesTable data={rows} emptyAction={status === "open" || status === "all" ? newButton : undefined} />
    </>
  );
}
