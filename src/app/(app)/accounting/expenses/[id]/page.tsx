import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { StatusBadge } from "@/components/app/status-badge";
import { Amount } from "@/components/accounting/amount";
import { StatementSheet } from "@/components/accounting/statement-sheet";
import { VoidDialog } from "@/components/accounting/void-dialog";
import { formatDate, formatDateTime, round2 } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getExpense } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { voidExpenseEntry } from "../actions";

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(["accounting.expenses", "accounting.view"]);
  const { id } = await params;
  const [e, company] = await Promise.all([getExpense(id), getCompany()]);
  if (!e) notFound();
  const total = round2(e.amount + e.taxAmount);

  const rows: [string, React.ReactNode][] = [
    ["Date", formatDate(e.date, "long")],
    [
      "Category",
      <Link key="c" href={`/accounting/ledger?account=${e.expenseAccountId}`} className="text-primary hover:underline">
        {e.expCode} · {e.expName}
      </Link>,
    ],
    ["Paid from", `${e.paidCode} · ${e.paidName}`],
    ["Paid to", e.payee ?? e.supplierName ?? "—"],
    ...(e.supplierName ? ([["Supplier", e.supplierName]] as [string, React.ReactNode][]) : []),
    ["Description", e.description],
    ["Reference", e.reference ?? "—"],
    ["Recorded by", `${e.createdByName ?? "System"} · ${formatDateTime(e.createdAt)}`],
    [
      "Journal",
      e.journalEntryId ? (
        <Link key="j" href={`/accounting/journals/${e.journalEntryId}`} className="text-primary hover:underline">
          View journal entry
        </Link>
      ) : (
        "—"
      ),
    ],
  ];

  return (
    <>
      <PageHeader
        title={e.number}
        description={`${e.expName} — ${e.description}`}
        backHref="/accounting/expenses"
        badge={<StatusBadge status={e.status} />}
        actions={
          <>
            <PrintButton />
            {e.status === "posted" && can(user, "accounting.expenses") && (
              <VoidDialog
                id={e.id}
                action={voidExpenseEntry}
                title={`Void expense ${e.number}?`}
                description="The money goes back to the account it was paid from and the expense drops out of your reports."
                success="Expense voided"
              />
            )}
          </>
        }
      />
      <StatementSheet company={company.name} title={`Expense ${e.number}`} className="max-w-2xl">
        <dl className="divide-y">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-3 gap-3 py-2.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="col-span-2">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 ml-auto max-w-xs space-y-1.5 border-t pt-3">
          <div className="flex justify-between text-muted-foreground">
            <span>Amount</span>
            <Amount value={e.amount} className="text-foreground" />
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Input tax</span>
            <Amount value={e.taxAmount} className="text-foreground" />
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total paid</span>
            <Amount value={total} />
          </div>
        </div>
      </StatementSheet>
    </>
  );
}
