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
import { getTransfer } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { voidBankTransfer } from "../../actions";

export default async function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("accounting.view");
  const { id } = await params;
  const [t, company] = await Promise.all([getTransfer(id), getCompany()]);
  if (!t) notFound();

  const rows: [string, React.ReactNode][] = [
    ["Date", formatDate(t.date, "long")],
    ["From", `${t.fromCode} · ${t.fromName}`],
    ["To", `${t.toCode} · ${t.toName}`],
    ["Amount", <Amount key="a" value={t.amount} className="font-semibold" />],
    ["Reference", t.reference ?? "—"],
    ["Notes", t.notes ?? "—"],
    ["Recorded by", `${t.createdByName ?? "System"} · ${formatDateTime(t.createdAt)}`],
    [
      "Journal",
      t.journalEntryId ? (
        <Link key="j" href={`/accounting/journals/${t.journalEntryId}`} className="text-primary hover:underline">
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
        title={t.number}
        description={`${t.fromName} → ${t.toName}`}
        backHref="/accounting/banking/transfers"
        badge={<StatusBadge status={t.status} />}
        actions={
          <>
            <PrintButton />
            {t.status === "posted" && can(user, "accounting.banking") && (
              <VoidDialog
                id={t.id}
                action={voidBankTransfer}
                title={`Void transfer ${t.number}?`}
                description="The money goes back to the account it came from. The transfer stays on record as void."
                success="Transfer voided"
              />
            )}
          </>
        }
      />
      <StatementSheet company={company.name} title={`Bank Transfer ${t.number}`} className="max-w-2xl">
        <dl className="divide-y">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-3 gap-3 py-2.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="col-span-2">{v}</dd>
            </div>
          ))}
        </dl>
      </StatementSheet>
    </>
  );
}
