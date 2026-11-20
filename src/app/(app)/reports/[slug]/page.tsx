import { notFound, redirect } from "next/navigation";
import {
  AlarmClock,
  Banknote,
  Boxes,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  HandCoins,
  Landmark,
  Package,
  Percent,
  ReceiptText,
  Scale,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import { formatMoney, formatNumber, formatQty, today } from "@/lib/format";
import { readPeriod } from "@/lib/period";
import { PeriodFilter } from "@/components/app/period-filter";
import { StatCard } from "@/components/app/stat-card";
import { ParamSelect, ParamToggle } from "@/components/reports/filters";
import { canSeeReport, findReport } from "@/components/reports/registry";
import { ReportShell } from "@/components/reports/report-shell";
import {
  AgedTable,
  DailyCashTable,
  ExpenseTable,
  PayrollTable,
  PurchasesByProductTable,
  PurchasesBySupplierTable,
  ReorderTable,
  SalesByCategoryTable,
  SalesByCustomerTable,
  SalesByProductTable,
  SalesBySalespersonTable,
  SalesSummaryTable,
  StockMovementTable,
  TaxTable,
  ValuationTables,
} from "@/components/reports/tables";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { warehouseOptions } from "@/server/queries/options";
import * as R from "@/server/queries/reports";

type SP = { from?: string; to?: string; group?: string; warehouse?: string; account?: string };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: findReport(slug)?.title ?? "Report" };
}

const m = (v: number) => formatMoney(v);

export default async function ReportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const user = await requirePermission("reports.view");
  const { slug } = await params;
  const sp = await searchParams;
  const def = findReport(slug);
  if (!def) notFound();
  if (!canSeeReport(user.permissions, def)) redirect("/forbidden");

  const company = await getCompany();
  const showCost = can(user, ["inventory.cost", "accounting.view"]);
  const fiscal = company.fiscalYearStartMonth;
  const shell = { title: def.title, description: def.description, companyName: company.name };

  switch (slug) {
    // ---- Sales ---------------------------------------------------------------------------------
    case "sales-summary": {
      const period = readPeriod(sp);
      const group = sp.group === "month" ? "month" : "day";
      const data = await R.salesSummary({ ...period, group });
      const t = data.totals;
      return (
        <ReportShell
          {...shell}
          period={period}
          filters={
            <>
              <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />
              <div className="ml-auto">
                <ParamToggle name="group" value={group} options={[{ value: "day", label: "By day" }, { value: "month", label: "By month" }]} />
              </div>
            </>
          }
          summary={
            <>
              <StatCard label="Net sales" value={m(t.net)} icon={TrendingUp} hint={`${formatNumber(t.invoices)} invoice${t.invoices === 1 ? "" : "s"}`} />
              <StatCard label="Discounts given" value={m(t.discounts)} icon={Percent} tone="warning" hint={t.gross ? `${((t.discounts / t.gross) * 100).toFixed(1)}% of gross` : "—"} />
              <StatCard label="Returns" value={m(t.returns)} icon={Undo2} tone="danger" hint={`Net after returns ${m(t.netAfterReturns)}`} />
              <StatCard label="Average invoice" value={m(data.average)} icon={ReceiptText} tone="info" hint={`Tax collected ${m(t.tax)}`} />
            </>
          }
        >
          <SalesSummaryTable rows={data.rows} totals={t} group={group} />
        </ReportShell>
      );
    }
    case "sales-by-product": {
      const period = readPeriod(sp);
      const data = await R.salesByProduct(period);
      const t = data.totals;
      const best = data.rows[0];
      return (
        <ReportShell {...shell} period={period} filters={<PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />}
          summary={
            <>
              <StatCard label="Revenue" value={m(t.revenue)} icon={TrendingUp} hint={`${formatNumber(t.products)} product${t.products === 1 ? "" : "s"} sold`} />
              {showCost && <StatCard label="Gross profit" value={m(t.profit)} icon={CircleDollarSign} tone="success" hint={`${t.margin.toFixed(1)}% margin`} />}
              {showCost && <StatCard label="Cost of goods sold" value={m(t.cost)} icon={Package} tone="warning" />}
              <StatCard label="Best seller" value={<span className="text-lg">{best?.name ?? "—"}</span>} icon={Boxes} tone="info" hint={best ? m(best.revenue) : "No sales yet"} />
            </>
          }
        >
          <SalesByProductTable rows={data.rows} totals={t} showCost={showCost} />
        </ReportShell>
      );
    }
    case "sales-by-customer": {
      const period = readPeriod(sp);
      const data = await R.salesByCustomer(period);
      const t = data.totals;
      const top = data.rows[0];
      return (
        <ReportShell {...shell} period={period} filters={<PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />}
          summary={
            <>
              <StatCard label="Customers" value={formatNumber(t.customers)} icon={Users} hint={`${formatNumber(t.invoices)} invoices`} />
              <StatCard label="Net after returns" value={m(t.netAfterReturns)} icon={TrendingUp} tone="success" hint={`Returns ${m(t.returns)}`} />
              <StatCard label="Still unpaid" value={m(t.outstanding)} icon={HandCoins} tone="danger" hint="On these invoices" />
              <StatCard label="Top customer" value={<span className="text-lg">{top?.name ?? "—"}</span>} icon={Users} tone="info" hint={top ? m(top.netAfterReturns) : "No sales yet"} />
            </>
          }
        >
          <SalesByCustomerTable rows={data.rows} totals={t} />
        </ReportShell>
      );
    }
    case "sales-by-category": {
      const period = readPeriod(sp);
      const data = await R.salesByCategory(period);
      const t = data.totals;
      const top = data.rows[0];
      return (
        <ReportShell {...shell} period={period} filters={<PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />}
          summary={
            <>
              <StatCard label="Revenue" value={m(t.revenue)} icon={TrendingUp} hint={`${formatNumber(t.categories)} categor${t.categories === 1 ? "y" : "ies"}`} />
              {showCost && <StatCard label="Gross profit" value={m(t.profit)} icon={CircleDollarSign} tone="success" hint={`${t.margin.toFixed(1)}% margin`} />}
              <StatCard label="Top category" value={<span className="text-lg">{top?.name ?? "—"}</span>} icon={Boxes} tone="info" hint={top ? `${top.share.toFixed(1)}% of revenue` : "No sales yet"} />
            </>
          }
        >
          <SalesByCategoryTable rows={data.rows} totals={t} showCost={showCost} />
        </ReportShell>
      );
    }
    case "sales-by-salesperson": {
      const period = readPeriod(sp);
      const data = await R.salesBySalesperson(period);
      const t = data.totals;
      const top = data.rows.find((r) => r.name !== "Unassigned");
      return (
        <ReportShell {...shell} period={period} filters={<PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />}
          summary={
            <>
              <StatCard label="Salespeople" value={formatNumber(t.people)} icon={Users} hint={`${formatNumber(t.invoices)} invoices`} />
              <StatCard label="Net after returns" value={m(t.netAfterReturns)} icon={TrendingUp} tone="success" />
              {showCost && <StatCard label="Gross profit" value={m(t.profit)} icon={CircleDollarSign} tone="success" />}
              <StatCard label="Top salesperson" value={<span className="text-lg">{top?.name ?? "—"}</span>} icon={Users} tone="info" hint={top ? m(top.netAfterReturns) : "No named salesperson"} />
            </>
          }
        >
          <SalesBySalespersonTable rows={data.rows} totals={t} showCost={showCost} />
        </ReportShell>
      );
    }

    // ---- Purchasing ----------------------------------------------------------------------------
    case "purchases-by-supplier": {
      const period = readPeriod(sp);
      const data = await R.purchasesBySupplier(period);
      const t = data.totals;
      return (
        <ReportShell {...shell} period={period} filters={<PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />}
          summary={
            <>
              <StatCard label="Total billed" value={m(t.total)} icon={ShoppingCart} hint={`${formatNumber(t.bills)} bill${t.bills === 1 ? "" : "s"} · ${formatNumber(t.suppliers)} suppliers`} />
              <StatCard label="Input tax" value={m(t.tax)} icon={Scale} tone="info" hint={`Freight ${m(t.freight)}`} />
              <StatCard label="Returns" value={m(t.returns)} icon={Undo2} tone="warning" />
              <StatCard label="Still unpaid" value={m(t.outstanding)} icon={Banknote} tone="danger" hint="On these bills" />
            </>
          }
        >
          <PurchasesBySupplierTable rows={data.rows} totals={t} />
        </ReportShell>
      );
    }
    case "purchases-by-product": {
      const period = readPeriod(sp);
      const data = await R.purchasesByProduct(period);
      const top = data.rows[0];
      return (
        <ReportShell {...shell} period={period} filters={<PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />}
          summary={
            <>
              <StatCard label="Purchased value" value={m(data.totals.value)} icon={ShoppingCart} hint="Net of discounts and returns, before tax" />
              <StatCard label="Products" value={formatNumber(data.totals.products)} icon={Package} tone="info" />
              <StatCard label="Largest purchase" value={<span className="text-lg">{top?.name ?? "—"}</span>} icon={Truck} tone="warning" hint={top ? m(top.value) : "Nothing bought yet"} />
            </>
          }
        >
          <PurchasesByProductTable rows={data.rows} totals={data.totals} />
        </ReportShell>
      );
    }

    // ---- Inventory -----------------------------------------------------------------------------
    case "inventory-valuation": {
      const warehouses = await warehouseOptions();
      const warehouseId = warehouses.some((w) => w.value === sp.warehouse) ? sp.warehouse! : null;
      const data = await R.inventoryValuation({ warehouseId });
      const topCat = data.byCategory[0];
      return (
        <ReportShell
          {...shell}
          asOf={today()}
          filters={<ParamSelect name="warehouse" value={warehouseId} allLabel="All warehouses" options={warehouses.map((w) => ({ value: w.value, label: w.label }))} />}
          summary={
            <>
              <StatCard label="Stock value" value={m(data.totals.value)} icon={Boxes} hint="Quantity × moving-average cost" />
              <StatCard label="Products in stock" value={formatNumber(data.totals.products)} icon={Package} tone="info" hint={`${formatNumber(data.totals.lines)} product/warehouse lines`} />
              <StatCard label="Warehouses" value={formatNumber(data.byWarehouse.length)} icon={Landmark} tone="success" />
              <StatCard label="Largest category" value={<span className="text-lg">{topCat?.name ?? "—"}</span>} icon={ClipboardList} tone="warning" hint={topCat ? `${topCat.share.toFixed(1)}% of value` : "No stock yet"} />
            </>
          }
        >
          <ValuationTables items={data.items} byWarehouse={data.byWarehouse} byCategory={data.byCategory} total={data.totals.value} />
        </ReportShell>
      );
    }
    case "reorder": {
      const data = await R.reorderReport();
      return (
        <ReportShell
          {...shell}
          asOf={today()}
          summary={
            <>
              <StatCard label="Items to reorder" value={formatNumber(data.totals.items)} icon={ClipboardList} tone="warning" />
              <StatCard label="Out of stock" value={formatNumber(data.totals.outOfStock)} icon={AlarmClock} tone="danger" />
              {showCost && <StatCard label="Estimated order cost" value={m(data.totals.estimatedCost)} icon={ShoppingCart} tone="info" hint="Suggested qty × last purchase cost" />}
            </>
          }
        >
          <p className="no-print text-sm text-muted-foreground">
            Suggested order = enough to get back above the reorder level, at least the product&apos;s usual reorder quantity, less what is already on approved purchase orders.
          </p>
          <ReorderTable rows={data.rows} showCost={showCost} estimatedCost={data.totals.estimatedCost} />
        </ReportShell>
      );
    }
    case "stock-movement-summary": {
      const period = readPeriod(sp);
      const warehouses = await warehouseOptions();
      const warehouseId = warehouses.some((w) => w.value === sp.warehouse) ? sp.warehouse! : null;
      const data = await R.stockMovementSummary({ ...period, warehouseId });
      return (
        <ReportShell
          {...shell}
          period={period}
          filters={
            <>
              <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />
              <ParamSelect name="warehouse" value={warehouseId} allLabel="All warehouses" options={warehouses.map((w) => ({ value: w.value, label: w.label }))} />
            </>
          }
          summary={
            <>
              <StatCard label="Products moved" value={formatNumber(data.totals.products)} icon={Package} />
              <StatCard label="Quantity in" value={formatQty(data.totals.inQty)} icon={TrendingUp} tone="success" />
              <StatCard label="Quantity out" value={formatQty(data.totals.outQty)} icon={TrendingDown} tone="danger" />
              {showCost && <StatCard label="Closing value" value={m(data.totals.closingValue)} icon={Boxes} tone="info" />}
            </>
          }
        >
          {!warehouseId && <p className="no-print text-sm text-muted-foreground">Across all warehouses, transfers between warehouses are left out because they don&apos;t change the total.</p>}
          <StockMovementTable rows={data.rows} totals={data.totals} showCost={showCost} />
        </ReportShell>
      );
    }

    // ---- Finance -------------------------------------------------------------------------------
    case "aged-receivables":
    case "aged-payables": {
      const kind = slug === "aged-receivables" ? "customer" : "supplier";
      const asOf = today();
      const data = kind === "customer" ? await R.agedReceivables({ asOf }) : await R.agedPayables({ asOf });
      const t = data.totals;
      const share = (v: number) => (t.total ? `${((v / t.total) * 100).toFixed(0)}% of total` : "—");
      return (
        <ReportShell
          {...shell}
          asOf={asOf}
          summary={
            <>
              <StatCard label={kind === "customer" ? "Total receivable" : "Total payable"} value={m(t.total)} icon={kind === "customer" ? HandCoins : Banknote} hint={`${formatNumber(t.documents)} open ${kind === "customer" ? "invoices" : "bills"} · ${formatNumber(t.parties)} ${kind === "customer" ? "customers" : "suppliers"}`} />
              <StatCard label="Not yet due" value={m(t.current)} icon={CalendarClock} tone="success" hint={share(t.current)} />
              <StatCard label="Overdue" value={m(data.overdue)} icon={AlarmClock} tone="warning" hint={share(data.overdue)} />
              <StatCard label="Over 90 days" value={m(t.d90)} icon={AlarmClock} tone="danger" hint={share(t.d90)} />
            </>
          }
        >
          <p className="no-print text-sm text-muted-foreground">
            Days past due are counted from each {kind === "customer" ? "invoice" : "bill"}&apos;s due date (or its date when there is none). Only posted documents with a balance are included.
          </p>
          <AgedTable rows={data.rows} totals={t} kind={kind} />
        </ReportShell>
      );
    }
    case "tax-summary": {
      const period = readPeriod(sp);
      const data = await R.taxSummary(period);
      const glDiff = Math.abs(data.gl.net - data.net) > 0.5;
      return (
        <ReportShell {...shell} period={period} filters={<PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />}
          summary={
            <>
              <StatCard label="Output tax (sales)" value={m(data.output)} icon={TrendingUp} tone="info" />
              <StatCard label="Input tax (purchases)" value={m(data.input)} icon={TrendingDown} tone="success" />
              <StatCard label={data.net >= 0 ? "Net tax payable" : "Net tax refundable"} value={m(Math.abs(data.net))} icon={Scale} tone={data.net > 0 ? "danger" : "success"} />
              <StatCard label="Per the GL tax accounts" value={m(data.gl.net)} icon={Landmark} tone={glDiff ? "warning" : "default"} hint={glDiff ? "Differs from documents: check manual journals" : "Matches the documents"} />
            </>
          }
        >
          <TaxTable rows={data.rows} output={data.output} input={data.input} net={data.net} />
        </ReportShell>
      );
    }
    case "expense-by-category": {
      const period = readPeriod(sp);
      const scope = sp.group === "operating" ? "operating" : "all";
      const data = await R.expenseByCategory({ ...period, includeCostOfSales: scope === "all" });
      return (
        <ReportShell
          {...shell}
          period={period}
          filters={
            <>
              <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />
              <div className="ml-auto">
                <ParamToggle name="group" value={scope} options={[{ value: "all", label: "All expenses" }, { value: "operating", label: "Operating only" }]} />
              </div>
            </>
          }
          summary={
            <>
              <StatCard label="Total expenses" value={m(data.total)} icon={Wallet} tone="warning" hint={`${formatNumber(data.accounts)} account${data.accounts === 1 ? "" : "s"}`} />
              <StatCard label="Largest" value={<span className="text-lg">{data.largest?.name ?? "—"}</span>} icon={ReceiptText} tone="danger" hint={data.largest ? `${m(data.largest.amount)} · ${data.largest.share.toFixed(1)}%` : "No expenses yet"} />
            </>
          }
        >
          <ExpenseTable rows={data.rows} total={data.total} />
        </ReportShell>
      );
    }
    case "daily-cash": {
      const period = readPeriod(sp);
      const accounts = await R.cashAccounts();
      const accountId = accounts.some((a) => a.id === sp.account) ? sp.account! : null;
      const data = await R.dailyCash({ ...period, accountId });
      return (
        <ReportShell
          {...shell}
          period={period}
          filters={
            <>
              <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />
              <ParamSelect name="account" value={accountId} allLabel="All cash & bank" className="h-9 w-56" options={accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} />
            </>
          }
          summary={
            <>
              <StatCard label="Opening balance" value={m(data.opening)} icon={Landmark} />
              <StatCard label="Receipts" value={m(data.receipts)} icon={TrendingUp} tone="success" />
              <StatCard label="Payments" value={m(data.payments)} icon={TrendingDown} tone="danger" />
              <StatCard label="Closing balance" value={m(data.closing)} icon={Wallet} tone="info" hint={`Net ${m(data.receipts - data.payments)}`} />
            </>
          }
        >
          {!accountId && <p className="no-print text-sm text-muted-foreground">With all accounts selected, transfers between your own cash and bank accounts are left out.</p>}
          <DailyCashTable rows={data.rows} receipts={data.receipts} payments={data.payments} closing={data.closing} />
        </ReportShell>
      );
    }

    // ---- HR ------------------------------------------------------------------------------------
    case "payroll-summary": {
      const y = today().slice(0, 4);
      const period = readPeriod(sp, { from: `${y}-01-01`, to: `${y}-12-31` });
      const data = await R.payrollSummary(period);
      const t = data.totals;
      return (
        <ReportShell {...shell} period={period} filters={<PeriodFilter from={period.from} to={period.to} fiscalStartMonth={fiscal} />}
          summary={
            <>
              <StatCard label="Gross salaries" value={m(t.gross)} icon={Banknote} hint={`${formatNumber(t.runs)} payroll run${t.runs === 1 ? "" : "s"}`} />
              <StatCard label="Deductions" value={m(t.deductions)} icon={TrendingDown} tone="warning" />
              <StatCard label="Net pay" value={m(t.net)} icon={Wallet} tone="info" hint={`Paid ${m(t.paid)}`} />
              <StatCard label="Unpaid salaries" value={m(t.outstanding)} icon={AlarmClock} tone={t.outstanding > 0 ? "danger" : "success"} />
            </>
          }
        >
          <PayrollTable rows={data.rows} totals={t} />
        </ReportShell>
      );
    }
  }
  notFound();
}
