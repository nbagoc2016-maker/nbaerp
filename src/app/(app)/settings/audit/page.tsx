import { readPeriod } from "@/lib/period";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { ParamSelect } from "@/components/reports/filters";
import { AuditTable } from "@/components/settings/audit-table";
import { humanize } from "@/components/settings/humanize";
import { requirePermission } from "@/server/auth";
import { auditFilterOptions, auditLog } from "@/server/queries/admin";
import { getCompany } from "@/server/queries/company";

export const metadata = { title: "Audit log" };

type SP = { from?: string; to?: string; user?: string; entity?: string; action?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("settings.audit");
  const sp = await searchParams;
  const period = readPeriod(sp);
  const [opts, company] = await Promise.all([auditFilterOptions(), getCompany()]);
  const userId = opts.users.some((u) => u.id === sp.user) ? sp.user : undefined;
  const entity = sp.entity && opts.entities.includes(sp.entity) ? sp.entity : undefined;
  const action = sp.action && opts.actions.includes(sp.action) ? sp.action : undefined;
  const { rows, limited } = await auditLog({ ...period, userId, entity, action });

  return (
    <div className="space-y-5">
      <PageHeader className="mb-0" title="Audit log" description="Every sign-in, create, post, void and settings change, with who did it and when." />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
        <ParamSelect name="user" value={userId} allLabel="All users" className="h-9 w-40" options={opts.users.map((u) => ({ value: u.id, label: u.name }))} />
        <ParamSelect name="entity" value={entity} allLabel="All records" className="h-9 w-44" options={opts.entities.map((e) => ({ value: e, label: humanize(e) }))} />
        <ParamSelect name="action" value={action} allLabel="All actions" className="h-9 w-36" options={opts.actions.map((a) => ({ value: a, label: humanize(a) }))} />
      </div>
      {limited && <p className="text-sm text-muted-foreground">Showing the latest 1,000 entries. Narrow the filters to see older ones.</p>}
      <AuditTable rows={rows} />
    </div>
  );
}
