import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { db } from "@/db";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { PrintButton } from "@/components/app/print-button";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { fmtAmount } from "@/components/accounting/amount";
import { ExportCsvButton } from "@/components/accounting/export-csv-button";
import { LedgerTable, ledgerCsv } from "@/components/accounting/ledger-table";
import { StatementSheet } from "@/components/accounting/statement-sheet";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { listFunds } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { generalLedger } from "@/server/services/finance-reports";

export default async function FundStatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePermission(["accounting.pettycash", "accounting.view"]);
  const { id } = await params;
  const period = readPeriod(await searchParams);
  const [funds, company] = await Promise.all([listFunds(), getCompany()]);
  const fund = funds.find((f) => f.id === id);
  if (!fund) notFound();
  const gl = await generalLedger(db, { accountId: fund.accountId, ...period });
  const canPetty = can(user, "accounting.pettycash") && fund.isActive;

  return (
    <>
      <PageHeader
        title={fund.name}
        description={`Petty cash statement · ${fund.code}${fund.custodianName ? ` · Custodian: ${fund.custodianName}` : ""}`}
        backHref="/accounting/petty-cash"
        badge={<StatusBadge status={fund.isActive ? "active" : "inactive"} />}
        actions={
          <>
            <PrintButton />
            <ExportCsvButton rows={ledgerCsv(gl)} filename={`petty-cash-${fund.code}-${period.from}-${period.to}`} />
            {canPetty && fund.replenish > 0 && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/accounting/petty-cash/new?fund=${fund.id}&type=topup&amount=${fund.replenish}`}>
                  <RefreshCw className="size-4" />
                  Replenish {formatMoney(fund.replenish)}
                </Link>
              </Button>
            )}
            {canPetty && (
              <Button size="sm" asChild>
                <Link href={`/accounting/petty-cash/new?fund=${fund.id}`}>
                  <Plus className="size-4" />
                  New voucher
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="no-print mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Balance now" value={fmtAmount(fund.balance)} hint={`Float ${formatMoney(fund.floatAmount)}`} />
        <StatCard label="Opening" value={fmtAmount(gl.opening)} hint={formatDate(period.from)} />
        <StatCard label="Topped up" value={fmtAmount(gl.totalDebit)} tone="success" hint="in this period" />
        <StatCard label="Spent" value={fmtAmount(gl.totalCredit)} tone="danger" hint="in this period" />
      </div>
      <div className="no-print mb-4">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>
      <StatementSheet company={company.name} title={`Petty Cash Statement — ${fund.name}`} subtitle={`${formatDate(period.from, "long")} to ${formatDate(period.to, "long")}`}>
        <LedgerTable gl={gl} inOutLabels />
      </StatementSheet>
    </>
  );
}
