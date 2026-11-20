import { db } from "@/db";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { PrintButton } from "@/components/app/print-button";
import { ExportCsvButton } from "@/components/accounting/export-csv-button";
import { CloseBooksCard, CompareToggle, StatementTabs } from "@/components/accounting/statement-controls";
import { StatementSheet } from "@/components/accounting/statement-sheet";
import {
  BalanceSheetTable,
  CashFlowTable,
  ProfitAndLossTable,
  TrialBalanceTable,
  balanceSheetCsv,
  cashFlowCsv,
  profitAndLossCsv,
  trialBalanceCsv,
} from "@/components/accounting/statements";
import { AsOfFilter } from "@/components/accounting/url-filters";
import { formatDate, today } from "@/lib/format";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { balanceSheet, cashFlow, profitAndLoss, trialBalance } from "@/server/services/finance-reports";
import { STATEMENT_TABS, previousPeriod } from "@/server/services/finance-shared";

type Tab = (typeof STATEMENT_TABS)[number]["value"];

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; asOf?: string; from?: string; to?: string; compare?: string }>;
}) {
  const user = await requirePermission("accounting.view");
  const sp = await searchParams;
  const tab: Tab = STATEMENT_TABS.some((t) => t.value === sp.tab) ? (sp.tab as Tab) : "tb";
  const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : today();
  const period = readPeriod(sp);
  const compare = sp.compare === "1";
  const company = await getCompany();
  const periodText = `${formatDate(period.from, "long")} to ${formatDate(period.to, "long")}`;
  const asOfText = `As of ${formatDate(asOf, "long")}`;

  let title = "";
  let subtitle = "";
  let csv: (string | number | null | undefined)[][] = [];
  let filename = "";
  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (tab === "tb") {
    const tb = await trialBalance(db, asOf);
    title = "Trial Balance";
    subtitle = asOfText;
    csv = trialBalanceCsv(tb);
    filename = `trial-balance-${asOf}`;
    body = <TrialBalanceTable tb={tb} />;
  } else if (tab === "pnl") {
    const cur = await profitAndLoss(db, period);
    const prev = compare ? await profitAndLoss(db, previousPeriod(period.from, period.to)) : null;
    title = "Profit & Loss";
    subtitle = prev ? `${periodText} · compared with ${formatDate(prev.from)} – ${formatDate(prev.to)}` : periodText;
    csv = profitAndLossCsv(cur, prev);
    filename = `profit-and-loss-${period.from}-${period.to}`;
    body = <ProfitAndLossTable cur={cur} prev={prev} />;
    footer = "Revenue is sales less returns. Cost of sales covers cost of goods sold, freight in and stock adjustments.";
  } else if (tab === "bs") {
    const bs = await balanceSheet(db, asOf);
    title = "Balance Sheet";
    subtitle = asOfText;
    csv = balanceSheetCsv(bs);
    filename = `balance-sheet-${asOf}`;
    body = <BalanceSheetTable bs={bs} />;
    footer = "Current period earnings are all income less all expenses up to this date that haven't been closed to retained earnings.";
  } else {
    const cf = await cashFlow(db, period);
    title = "Cash Flow Summary";
    subtitle = periodText;
    csv = cashFlowCsv(cf);
    filename = `cash-flow-${period.from}-${period.to}`;
    body = <CashFlowTable cf={cf} />;
    footer = "Cash and bank includes cash in hand, bank accounts, wallets and petty cash. Money is grouped by the document that moved it.";
  }

  return (
    <>
      <PageHeader
        title="Financial Statements"
        description="Trial balance, profit and loss, balance sheet and cash flow — straight from the ledger."
        actions={
          <>
            <PrintButton />
            <ExportCsvButton rows={csv} filename={filename} />
          </>
        }
      />
      <div className="no-print mb-4 flex flex-col gap-3">
        <StatementTabs value={tab} />
        <div className="flex flex-wrap items-center gap-3">
          {tab === "tb" || tab === "bs" ? (
            <AsOfFilter value={asOf} />
          ) : (
            <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
          )}
          {tab === "pnl" && <CompareToggle on={compare} />}
        </div>
      </div>

      <StatementSheet company={company.name} title={title} subtitle={subtitle} footer={footer} className="mb-6">
        {body}
      </StatementSheet>

      {can(user, "accounting.close") && <CloseBooksCard lockDate={company.lockDate ?? null} />}
    </>
  );
}
