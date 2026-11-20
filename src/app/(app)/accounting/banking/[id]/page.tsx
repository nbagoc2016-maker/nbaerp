import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { db } from "@/db";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { PrintButton } from "@/components/app/print-button";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { fmtAmount } from "@/components/accounting/amount";
import { EditBankAccountDialog } from "@/components/accounting/bank-account-form";
import { ExportCsvButton } from "@/components/accounting/export-csv-button";
import { LedgerTable, ledgerCsv } from "@/components/accounting/ledger-table";
import { StatementSheet } from "@/components/accounting/statement-sheet";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { getRegister } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { generalLedger } from "@/server/services/finance-reports";

const KIND_LABEL = { bank: "Bank account", cash: "Cash", wallet: "Mobile wallet" } as const;

export default async function CashBookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePermission("accounting.view");
  const { id } = await params;
  const sp = await searchParams;
  const period = readPeriod(sp);
  const [reg, company] = await Promise.all([getRegister(id), getCompany()]);
  if (!reg) notFound();
  const gl = await generalLedger(db, { accountId: reg.accountId, ...period });
  const canBank = can(user, "accounting.banking");
  const details = [reg.bankName, reg.accountTitle, reg.accountNumber && `A/C ${reg.accountNumber}`, reg.iban && `IBAN ${reg.iban}`, reg.branch].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title={reg.name}
        description={`${KIND_LABEL[reg.kind]} · ${reg.code}${details ? ` · ${details}` : ""}`}
        backHref="/accounting/banking"
        badge={<StatusBadge status={reg.isActive ? "active" : "inactive"} />}
        actions={
          <>
            <PrintButton />
            <ExportCsvButton rows={ledgerCsv(gl)} filename={`cash-book-${reg.code}-${period.from}-${period.to}`} />
            {canBank && (
              <>
                <EditBankAccountDialog
                  id={reg.id}
                  kind={reg.kind}
                  initial={{
                    name: reg.name,
                    bankName: reg.bankName ?? "",
                    accountTitle: reg.accountTitle ?? "",
                    accountNumber: reg.accountNumber ?? "",
                    iban: reg.iban ?? "",
                    branch: reg.branch ?? "",
                  }}
                />
                <Button size="sm" asChild>
                  <Link href={`/accounting/banking/transfers/new?from=${reg.accountId}`}>
                    <ArrowLeftRight className="size-4" />
                    Transfer
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="no-print mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Current balance" value={fmtAmount(reg.balance)} />
        <StatCard label="Opening" value={fmtAmount(gl.opening)} hint={formatDate(period.from)} />
        <StatCard label="Money in" value={fmtAmount(gl.totalDebit)} tone="success" hint="in this period" />
        <StatCard label="Money out" value={fmtAmount(gl.totalCredit)} tone="danger" hint="in this period" />
      </div>
      <div className="no-print mb-4">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>
      <StatementSheet company={company.name} title={`Cash Book — ${reg.name}`} subtitle={`${formatDate(period.from, "long")} to ${formatDate(period.to, "long")}`}>
        <LedgerTable gl={gl} inOutLabels />
      </StatementSheet>
    </>
  );
}
