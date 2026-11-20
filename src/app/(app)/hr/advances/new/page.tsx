import { PageHeader } from "@/components/app/page-header";
import { AdvanceForm } from "@/components/hr/advance-form";
import { requirePermission } from "@/server/auth";
import { listAdvances } from "@/server/queries/hr";
import { cashBankOptions, employeeOptions } from "@/server/queries/options";

export default async function NewAdvancePage({ searchParams }: { searchParams: Promise<{ employeeId?: string }> }) {
  await requirePermission("hr.payroll");
  const { employeeId } = await searchParams;
  const [employees, accounts, advances] = await Promise.all([employeeOptions(), cashBankOptions(), listAdvances()]);
  const balances: Record<string, number> = {};
  for (const a of advances) if (a.status === "open") balances[a.employeeId] = (balances[a.employeeId] ?? 0) + a.balance;
  return (
    <>
      <PageHeader title="Pay advance or loan" description="Money paid to an employee now and recovered from their salary." backHref="/hr/advances" />
      <AdvanceForm employees={employees} accounts={accounts} defaultEmployeeId={employeeId} balances={balances} />
    </>
  );
}
