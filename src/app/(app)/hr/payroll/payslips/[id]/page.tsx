import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, formatQty, monthLabel, round2 } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getPayslip } from "@/server/queries/hr";

function Column({ title, rows, total, totalLabel }: { title: string; rows: { label: string; value: number; hint?: string }[]; total: number; totalLabel: string }) {
  return (
    <div className="rounded-lg border">
      <p className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <dl className="divide-y">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4 px-4 py-2">
            <dt>
              {r.label}
              {r.hint && <span className="block text-xs text-muted-foreground">{r.hint}</span>}
            </dt>
            <dd className="tabular">{r.value ? formatMoney(r.value, { fixed: true }) : "—"}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 px-4 py-2 font-semibold">
          <dt>{totalLabel}</dt>
          <dd className="tabular">{formatMoney(total, { fixed: true })}</dd>
        </div>
      </dl>
    </div>
  );
}

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("hr.payroll");
  const { id } = await params;
  const [data, company] = await Promise.all([getPayslip(id), getCompany()]);
  if (!data) notFound();
  const { slip: s, run, employee: e } = data;
  const month = monthLabel(run.period);
  const earnings = [
    { label: "Basic salary", value: s.basic },
    { label: "Allowances", value: s.allowances },
    { label: "Overtime", value: s.overtime },
    { label: "Commission", value: s.commission },
    { label: "Bonus", value: s.bonus },
  ];
  const totalEarnings = round2(earnings.reduce((t, r) => t + r.value, 0));
  const deductions = [
    { label: "Absent days", value: s.absenceDeduction, hint: s.absentDays ? `${formatQty(s.absentDays)} of ${formatQty(s.workingDays)} working days` : undefined },
    { label: "Advance / loan recovery", value: s.advanceDeduction },
    { label: "Other deductions", value: s.otherDeduction },
  ];
  const totalDeductions = round2(deductions.reduce((t, r) => t + r.value, 0));
  const status = run.status === "posted" ? s.status : run.status;

  return (
    <>
      <PageHeader
        title={`Payslip · ${e.name}`}
        description={`${month} · ${run.number}`}
        backHref={`/hr/payroll/${run.id}`}
        badge={<StatusBadge status={status} />}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/hr/employees/${e.id}?tab=payslips`}>Employee</Link>
            </Button>
            <PrintButton label="Print payslip" />
          </>
        }
      />
      <PrintDocument
        company={company}
        title="Payslip"
        number={`${run.number} · ${e.code}`}
        date={run.date}
        meta={[
          { label: "Pay period", value: month },
          { label: "Paid days", value: `${formatQty(s.presentDays)} of ${formatQty(s.workingDays)}` },
          ...(run.status !== "posted" ? [{ label: "Status", value: run.status === "draft" ? "Draft (not final)" : "Void" }] : []),
        ]}
        party={{
          label: "Employee",
          name: e.name,
          lines: [
            [e.code, e.designation, data.department].filter(Boolean).join(" · "),
            e.cnic ? `CNIC ${e.cnic}` : null,
            e.bankName || e.bankAccount ? `Bank: ${[e.bankName, e.bankAccount].filter(Boolean).join(" · ")}` : null,
          ],
        }}
        footer={
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
              <Column title="Earnings" rows={earnings} total={totalEarnings} totalLabel="Total earnings" />
              <Column title="Deductions" rows={deductions} total={totalDeductions} totalLabel="Total deductions" />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3">
              <span className="font-semibold">Net pay</span>
              <span className="tabular text-xl font-semibold text-primary">{formatMoney(s.net, { fixed: true })}</span>
            </div>
            {data.payments.length > 0 && (
              <div className="text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</p>
                {data.payments.map((p) => (
                  <p key={p.id} className="flex justify-between">
                    <span>
                      {formatDate(p.date)} · {p.number}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <span className="tabular">{formatMoney(p.amount, { fixed: true })}</span>
                  </p>
                ))}
                {s.net - s.paidAmount > 0.005 && (
                  <p className="mt-1 flex justify-between font-medium text-destructive">
                    <span>Still due</span>
                    <span className="tabular">{formatMoney(s.net - s.paidAmount, { fixed: true })}</span>
                  </p>
                )}
              </div>
            )}
            {s.notes && <p className="rounded-lg bg-muted/40 p-3 text-sm">{s.notes}</p>}
            <div className="grid grid-cols-2 gap-8 pt-10 text-center text-xs text-muted-foreground">
              <p className="border-t pt-2">Prepared by</p>
              <p className="border-t pt-2">Received by (employee signature)</p>
            </div>
          </div>
        }
      />
    </>
  );
}
