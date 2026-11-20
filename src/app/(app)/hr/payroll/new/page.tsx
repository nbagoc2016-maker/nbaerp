import { PageHeader } from "@/components/app/page-header";
import { PayrollNewForm } from "@/components/hr/payroll-new-form";
import { requirePermission } from "@/server/auth";
import { listPayrollRuns, suggestedNextPeriod } from "@/server/queries/hr";

export default async function NewPayrollPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requirePermission("hr.payroll");
  const sp = await searchParams;
  const [runs, suggested] = await Promise.all([listPayrollRuns(), suggestedNextPeriod()]);
  const existing = Object.fromEntries(runs.filter((r) => r.status !== "void").map((r) => [r.period, r.id]));
  const period = sp.period && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.period) ? sp.period : suggested;
  return (
    <>
      <PageHeader title="Run payroll" description="Pick the month to pay." backHref="/hr/payroll" />
      <PayrollNewForm defaultPeriod={period} existing={existing} />
    </>
  );
}
