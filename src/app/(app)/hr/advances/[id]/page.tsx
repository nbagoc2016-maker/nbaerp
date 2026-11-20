import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmployeeAvatar } from "@/components/hr/employee-avatar";
import { VoidAdvanceButton } from "@/components/hr/void-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatMoney, monthLabel, round2 } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { getAdvance } from "@/server/queries/hr";

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export default async function AdvancePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("hr.payroll");
  const { id } = await params;
  const data = await getAdvance(id);
  if (!data) notFound();
  const a = data.advance;
  const isVoid = a.status === "void";
  const recovered = isVoid ? 0 : round2(a.amount - a.balance);
  const pct = a.amount > 0 ? Math.round((recovered / a.amount) * 100) : 0;
  const label = a.kind === "loan" ? "Staff loan" : "Salary advance";
  let running = a.amount;

  return (
    <>
      <PageHeader
        title={a.number}
        description={`${label} to ${data.employee} on ${formatDate(a.date, "long")}`}
        backHref="/hr/advances"
        badge={<StatusBadge status={a.status} />}
        actions={a.status === "open" && data.recoveries.length === 0 && <VoidAdvanceButton id={a.id} number={a.number} />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Link href={`/hr/employees/${a.employeeId}?tab=advances`} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50">
              <EmployeeAvatar name={data.employee} />
              <div>
                <p className="font-medium">{data.employee}</p>
                <p className="text-xs text-muted-foreground">{data.employeeCode}</p>
              </div>
            </Link>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Recovered</span>
                <span className="tabular text-sm font-medium">
                  {formatMoney(recovered)} of {formatMoney(a.amount)}
                </span>
              </div>
              <Progress value={pct} />
              <p className="text-right text-xs text-muted-foreground">{isVoid ? "Voided" : `${formatMoney(a.balance)} still to recover`}</p>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Amount" value={<Money value={a.amount} />} />
              <Detail label="Per payroll" value={<Money value={a.installmentAmount} />} />
              <Detail label="Balance" value={<Money value={a.balance} />} />
              <Detail label="Paid from" value={data.account && `${data.accountCode} · ${data.account}`} />
              <Detail label="Journal" value={data.journalNumber} />
              <Detail label="Recorded by" value={data.createdBy} />
              <div className="col-span-2">
                <Detail label="Reason" value={a.reason} />
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recovery history</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recoveries.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Payroll</th>
                      <th className="py-2 pr-3 text-right">Recovered</th>
                      <th className="py-2 text-right">Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b text-muted-foreground">
                      <td className="py-2 pr-3">{formatDate(a.date)}</td>
                      <td className="py-2 pr-3">Paid out</td>
                      <td className="py-2 pr-3 text-right">—</td>
                      <td className="tabular py-2 text-right">{formatMoney(a.amount)}</td>
                    </tr>
                    {data.recoveries.map((r) => {
                      running = round2(running - r.amount);
                      return (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">{formatDate(r.date)}</td>
                          <td className="py-2 pr-3">
                            <Link href={`/hr/payroll/payslips/${r.payslipId}`} className="font-medium text-primary hover:underline">
                              {monthLabel(r.period)} salary
                            </Link>
                            <span className="ml-2 text-xs text-muted-foreground">{r.runNumber}</span>
                          </td>
                          <td className="tabular py-2 pr-3 text-right font-medium">{formatMoney(r.amount)}</td>
                          <td className="tabular py-2 text-right">{formatMoney(running)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={isVoid ? "Voided before any recovery" : "Nothing recovered yet"}
                description={isVoid ? undefined : `The next payroll will deduct ${formatMoney(Math.min(a.installmentAmount, a.balance))} from ${data.employee}'s salary.`}
                className="py-10"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
