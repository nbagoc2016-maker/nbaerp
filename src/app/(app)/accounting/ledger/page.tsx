import { ScrollText } from "lucide-react";
import { db } from "@/db";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { PrintButton } from "@/components/app/print-button";
import { StatCard } from "@/components/app/stat-card";
import { fmtAmount } from "@/components/accounting/amount";
import { ExportCsvButton } from "@/components/accounting/export-csv-button";
import { LedgerControls } from "@/components/accounting/ledger-controls";
import { LedgerTable, ledgerCsv } from "@/components/accounting/ledger-table";
import { StatementSheet } from "@/components/accounting/statement-sheet";
import { formatDate } from "@/lib/format";
import { readPeriod } from "@/lib/period";
import { requirePermission } from "@/server/auth";
import { ledgerAccountOptions, partyPickerOptions } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { generalLedger } from "@/server/services/finance-reports";
import { ACCOUNT_TYPE_LABELS, PARTY_TYPES, type PartyType } from "@/server/services/finance-shared";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; from?: string; to?: string; partyType?: string; partyId?: string }>;
}) {
  await requirePermission("accounting.view");
  const sp = await searchParams;
  const period = readPeriod(sp);
  const [accounts, parties, company] = await Promise.all([ledgerAccountOptions(), partyPickerOptions(), getCompany()]);
  const accountId = sp.account && accounts.some((a) => a.value === sp.account) ? sp.account : null;
  const partyType = (PARTY_TYPES as readonly string[]).includes(sp.partyType ?? "") ? (sp.partyType as PartyType) : null;
  const partyId = partyType && sp.partyId ? sp.partyId : null;
  const gl = accountId ? await generalLedger(db, { accountId, ...period, partyType, partyId }) : null;
  const partyName = partyType && partyId ? parties[partyType].find((p) => p.value === partyId)?.label : null;

  return (
    <>
      <PageHeader
        title="General Ledger"
        description="Every posted line on an account, with opening and running balances."
        actions={
          gl ? (
            <>
              <PrintButton />
              <ExportCsvButton rows={ledgerCsv(gl)} filename={`ledger-${gl.account.code}-${period.from}-${period.to}`} />
            </>
          ) : undefined
        }
      />
      <div className="no-print mb-4 flex flex-col gap-3">
        <LedgerControls accounts={accounts} parties={parties} accountId={accountId} partyType={partyType} partyId={partyId} />
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>

      {!gl ? (
        <EmptyState icon={ScrollText} title="Choose an account" description="Pick any account to see its opening balance, every posting in the period and the running balance." />
      ) : (
        <>
          <div className="no-print mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Opening balance" value={fmtAmount(gl.opening)} hint={formatDate(period.from)} />
            <StatCard label="Debits" value={fmtAmount(gl.totalDebit)} hint={`${gl.lines.length} postings`} />
            <StatCard label="Credits" value={fmtAmount(gl.totalCredit)} />
            <StatCard label="Closing balance" value={fmtAmount(gl.closing)} hint={formatDate(period.to)} />
          </div>
          <StatementSheet
            company={company.name}
            title={`Ledger — ${gl.account.code} ${gl.account.name}`}
            subtitle={
              <>
                {ACCOUNT_TYPE_LABELS[gl.account.type]} · {formatDate(period.from, "long")} to {formatDate(period.to, "long")}
                {partyName ? ` · ${partyType}: ${partyName}` : ""}
              </>
            }
          >
            <LedgerTable gl={gl} />
          </StatementSheet>
        </>
      )}
    </>
  );
}
