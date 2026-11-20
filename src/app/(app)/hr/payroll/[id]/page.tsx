import { notFound } from "next/navigation";
import { Banknote, CircleDollarSign, Users, Wallet } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { PayAllDialog } from "@/components/hr/pay-dialogs";
import { PayrollGrid } from "@/components/hr/payroll-grid";
import { VoidRunButton, VoidSalaryPaymentButton } from "@/components/hr/void-buttons";
import { PrintButton } from "@/components/app/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney, monthLabel, round2 } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { getPayrollRun } from "@/server/queries/hr";
import { cashBankOptions } from "@/server/queries/options";

const METHOD: Record<string, string> = { cash: "Cash", bank: "Bank", cheque: "Cheque", wallet: "Wallet" };

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("hr.payroll");
  const { id } = await params;
  const [detail, accounts] = await Promise.all([getPayrollRun(id), cashBankOptions()]);
  if (!detail) notFound();
  const { run, slips, payments } = detail;
  const due = round2(run.totalNet - run.totalPaid);
  const dueCount = slips.filter((s) => s.slip.net - s.slip.paidAmount > 0.005).length;
  const postedPayments = payments.filter((p) => p.status === "posted");

  const description =
    run.status === "draft"
      ? "Draft — type overtime, commission, bonus and other deductions straight into the grid. Enter moves down a row."
      : `${run.number} · booked on ${formatDate(run.date, "long")}${detail.journalNumber ? ` · journal ${detail.journalNumber}` : ""}`;

  return (
    <>
      <PageHeader
        title={`Payroll · ${monthLabel(run.period)}`}
        description={description}
        backHref="/hr/payroll"
        badge={<StatusBadge status={run.status} />}
        actions={
          run.status === "posted" && (
            <>
              <PrintButton label="Print sheet" />
              {postedPayments.length === 0 && <VoidRunButton id={run.id} number={run.number} />}
              <PayAllDialog runId={run.id} due={due} count={dueCount} accounts={accounts} defaultDate={run.date} />
            </>
          )
        }
      />
      <div className="no-print mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees" value={slips.length} icon={Users} />
        <StatCard label="Gross salaries" value={formatMoney(run.totalGross)} icon={CircleDollarSign} tone="info" hint="After absence deductions" />
        <StatCard label="Deductions" value={formatMoney(run.totalDeductions)} icon={Wallet} tone="warning" hint="Advance recovery + other" />
        <StatCard
          label={run.status === "posted" ? "Still to pay" : "Net pay"}
          value={formatMoney(run.status === "posted" ? due : run.totalNet)}
          icon={Banknote}
          tone={run.status === "posted" && due > 0 ? "danger" : "success"}
          hint={run.status === "posted" ? `${formatMoney(run.totalPaid)} of ${formatMoney(run.totalNet)} paid` : "Saved totals; the grid updates live"}
        />
      </div>

      <PayrollGrid detail={detail} accounts={accounts} canPay />

      {run.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{run.notes}</p>}

      {payments.length > 0 && (
        <Card className="no-print mt-6">
          <CardHeader>
            <CardTitle>Salary payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Number</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Employee</th>
                    <th className="py-2 pr-3">Paid from</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{p.number}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{formatDate(p.date)}</td>
                      <td className="py-2 pr-3">{p.employee}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {p.account} · {METHOD[p.method] ?? p.method}
                        {p.reference && ` · ${p.reference}`}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Money value={p.amount} />
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="py-2 text-right">{p.status === "posted" && <VoidSalaryPaymentButton id={p.id} number={p.number} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {postedPayments.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">To void this payroll, void its salary payments first.</p>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
