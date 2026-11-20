import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { StatusBadge } from "@/components/app/status-badge";
import { Amount } from "@/components/accounting/amount";
import { SourceLink } from "@/components/accounting/source-link";
import { StatementSheet } from "@/components/accounting/statement-sheet";
import { VoidDialog } from "@/components/accounting/void-dialog";
import { formatDate, formatDateTime, round2 } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getJournal } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { SOURCE_LABELS, USER_VOIDABLE_SOURCES, sourceHref } from "@/server/services/finance-shared";
import { voidJournalEntry } from "../actions";

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("accounting.view");
  const { id } = await params;
  const [je, company] = await Promise.all([getJournal(id), getCompany()]);
  if (!je) notFound();
  const userVoidable = USER_VOIDABLE_SOURCES.includes(je.sourceType);
  const docHref = sourceHref(je.sourceType, je.sourceId);
  const totalDebit = round2(je.lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(je.lines.reduce((s, l) => s + l.credit, 0));

  return (
    <>
      <PageHeader
        title={je.number}
        description={je.memo ?? SOURCE_LABELS[je.sourceType]}
        backHref="/accounting/journals"
        badge={<StatusBadge status={je.status} />}
        actions={
          <>
            <PrintButton />
            {je.status === "posted" && userVoidable && can(user, "accounting.journal") && (
              <VoidDialog
                id={je.id}
                action={voidJournalEntry}
                title={`Void ${je.number}?`}
                description="The entry stays on record for audit but stops counting in every balance and report."
                success="Journal voided"
              />
            )}
          </>
        }
      />

      {!userVoidable && je.status === "posted" && (
        <div className="no-print mb-4 flex items-start gap-2 rounded-lg border bg-info/10 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-info" />
          <p>
            This journal was posted automatically by {SOURCE_LABELS[je.sourceType].toLowerCase()}
            {je.sourceNumber ? ` ${je.sourceNumber}` : ""}, so it can’t be voided here. To reverse it, void that document
            {docHref ? (
              <>
                {" "}
                (
                <Link href={docHref} className="font-medium text-primary hover:underline">
                  open it
                </Link>
                )
              </>
            ) : null}{" "}
            — that keeps the document, stock and books in step.
          </p>
        </div>
      )}

      <StatementSheet company={company.name} title={`Journal Entry ${je.number}`} subtitle={formatDate(je.date, "long")}>
        <dl className="mb-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Date</dt>
            <dd className="font-medium">{formatDate(je.date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Source</dt>
            <dd>
              <SourceLink sourceType={je.sourceType} sourceId={je.sourceId} sourceNumber={je.sourceNumber} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Created by</dt>
            <dd>{je.createdByName ?? "System"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Recorded</dt>
            <dd>{formatDateTime(je.createdAt)}</dd>
          </div>
        </dl>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Account</th>
              <th className="py-2 pr-2">Party</th>
              <th className="py-2 pr-2">Memo</th>
              <th className="py-2 pr-2 text-right">Debit</th>
              <th className="py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {je.lines.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-2 pr-2 text-muted-foreground">{l.lineNo}</td>
                <td className="py-2 pr-2">
                  <Link href={`/accounting/ledger?account=${l.accountId}&from=${je.date}&to=${je.date}`} className="hover:text-primary hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{l.code}</span> {l.name}
                  </Link>
                </td>
                <td className="py-2 pr-2">
                  {l.partyName ? (
                    <span>
                      {l.partyName} <span className="text-xs text-muted-foreground">({l.partyType})</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-2 text-muted-foreground">{l.memo ?? ""}</td>
                <td className="py-2 pr-2 text-right">{l.debit ? <Amount value={l.debit} /> : ""}</td>
                <td className="py-2 text-right">{l.credit ? <Amount value={l.credit} /> : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td colSpan={4} className="py-2">
                Total
              </td>
              <td className="py-2 pr-2 text-right">
                <Amount value={totalDebit} />
              </td>
              <td className="py-2 text-right">
                <Amount value={totalCredit} />
              </td>
            </tr>
          </tfoot>
        </table>
        {je.status === "void" && <p className="mt-4 text-sm font-medium text-destructive">This entry is void and excluded from all balances.</p>}
      </StatementSheet>
    </>
  );
}
