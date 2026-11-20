import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { StatusBadge } from "@/components/app/status-badge";
import { Amount } from "@/components/accounting/amount";
import { StatementSheet } from "@/components/accounting/statement-sheet";
import { VoidDialog } from "@/components/accounting/void-dialog";
import { formatDate, formatDateTime } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getVoucher } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { voidPettyCashVoucher } from "../actions";

export default async function VoucherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(["accounting.pettycash", "accounting.view"]);
  const { id } = await params;
  const [v, company] = await Promise.all([getVoucher(id), getCompany()]);
  if (!v) notFound();
  const isExpense = v.type === "expense";

  const rows: [string, React.ReactNode][] = [
    ["Date", formatDate(v.date, "long")],
    ["Fund", <Link key="f" href={`/accounting/petty-cash/funds/${v.fundId}`} className="text-primary hover:underline">{v.fundName}</Link>],
    [isExpense ? "Expense account" : "Taken from", `${v.accountCode} · ${v.accountName}`],
    ["Amount", <Amount key="a" value={v.amount} className="font-semibold" />],
    ...(isExpense ? ([["Paid to", v.payee ?? "—"], ["Receipt / bill no.", v.receiptRef ?? "—"]] as [string, React.ReactNode][]) : []),
    ["Description", v.description],
    ["Recorded by", `${v.createdByName ?? "System"} · ${formatDateTime(v.createdAt)}`],
    [
      "Journal",
      v.journalEntryId ? (
        <Link key="j" href={`/accounting/journals/${v.journalEntryId}`} className="text-primary hover:underline">
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
        title={v.number}
        description={`${isExpense ? "Petty cash expense" : "Petty cash top-up"} · ${v.fundName}`}
        backHref="/accounting/petty-cash"
        badge={<StatusBadge status={v.status} />}
        actions={
          <>
            <PrintButton />
            {v.status === "posted" && can(user, "accounting.pettycash") && (
              <VoidDialog
                id={v.id}
                action={voidPettyCashVoucher}
                title={`Void voucher ${v.number}?`}
                description={isExpense ? "The amount goes back into the fund balance." : "The top-up is taken back out of the fund and returned to the source account."}
                success="Voucher voided"
              />
            )}
          </>
        }
      />
      <StatementSheet company={company.name} title={`${isExpense ? "Petty Cash Voucher" : "Petty Cash Top-up"} ${v.number}`} className="max-w-2xl">
        <dl className="divide-y">
          {rows.map(([k, val]) => (
            <div key={k} className="grid grid-cols-3 gap-3 py-2.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="col-span-2">{val}</dd>
            </div>
          ))}
        </dl>
        {isExpense && (
          <div className="mt-10 hidden grid-cols-3 gap-6 text-center text-xs text-muted-foreground print:grid">
            <p className="border-t pt-2">Received by</p>
            <p className="border-t pt-2">Custodian{v.custodian ? ` (${v.custodian})` : ""}</p>
            <p className="border-t pt-2">Approved by</p>
          </div>
        )}
      </StatementSheet>
    </>
  );
}
