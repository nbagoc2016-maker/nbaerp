"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber, formatQty, monthLabel } from "@/lib/format";
import { DataTable, type ColumnMetaExt } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AgedRow,
  DailyCashRow,
  ExpenseRow,
  PayrollRow,
  PurchasesByProductRow,
  PurchasesBySupplierRow,
  ReorderRow,
  SalesByCategoryRow,
  SalesByCustomerRow,
  SalesByProductRow,
  SalesBySalespersonRow,
  SalesSummaryRow,
  StockMovementRow,
  TaxRow,
  ValuationGroup,
  ValuationItem,
} from "@/server/queries/reports-core";

// ---- column helpers ---------------------------------------------------------------------------

type Col<T> = ColumnDef<T, unknown>;
const right: ColumnMetaExt = { align: "right" };

function text<T>(key: keyof T & string, header: string, opts: { className?: string; strong?: boolean } = {}): Col<T> {
  return {
    accessorKey: key,
    header,
    meta: { className: opts.className },
    cell: ({ getValue }) => <span className={cn(opts.strong && "font-medium")}>{String(getValue() ?? "")}</span>,
  } as Col<T>;
}
function money<T>(key: keyof T & string, header: string, opts: { muteZero?: boolean; className?: string; tone?: "danger" | "success" } = {}): Col<T> {
  return {
    accessorKey: key,
    header,
    meta: right,
    cell: ({ getValue }) => (
      <Money
        value={getValue() as number}
        muteZero={opts.muteZero}
        className={cn(opts.className, opts.tone === "danger" && Number(getValue()) > 0 && "text-destructive", opts.tone === "success" && "text-success")}
      />
    ),
  } as Col<T>;
}
function qty<T>(key: keyof T & string, header: string, unitKey?: keyof T & string): Col<T> {
  return {
    accessorKey: key,
    header,
    meta: right,
    cell: ({ row, getValue }) => (
      <span className="tabular whitespace-nowrap">
        {formatQty(getValue() as number)}
        {unitKey && row.original[unitKey] ? <span className="ml-1 text-xs text-muted-foreground">{String(row.original[unitKey])}</span> : null}
      </span>
    ),
  } as Col<T>;
}
function count<T>(key: keyof T & string, header: string): Col<T> {
  return { accessorKey: key, header, meta: right, cell: ({ getValue }) => <span className="tabular">{formatNumber(getValue() as number)}</span> } as Col<T>;
}
function percent<T>(key: keyof T & string, header: string, opts: { bar?: boolean; signed?: boolean } = {}): Col<T> {
  return {
    accessorKey: key,
    header,
    meta: right,
    cell: ({ getValue }) => {
      const v = Number(getValue() ?? 0);
      return (
        <span className="inline-flex items-center justify-end gap-2">
          {opts.bar && (
            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:inline-block print:hidden">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
            </span>
          )}
          <span className={cn("tabular w-14", opts.signed && v < 0 && "text-destructive")}>{v.toFixed(1)}%</span>
        </span>
      );
    },
  } as Col<T>;
}

/** Totals row aligned with the columns: values keyed by column id, first column gets the label. */
function TotalsRow<T>({ columns, values, label = "Total" }: { columns: Col<T>[]; values: Record<string, React.ReactNode>; label?: string }) {
  return (
    <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
      {columns.map((c, i) => {
        const id = (c as { accessorKey?: string }).accessorKey ?? c.id ?? String(i);
        const meta = c.meta as ColumnMetaExt | undefined;
        const v = values[id];
        return (
          <TableCell key={id} className={cn("py-2.5", meta?.align === "right" && "text-right tabular")}>
            {i === 0 && v === undefined ? label : typeof v === "number" ? <Money value={v} /> : v}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

const qtyNode = (v: number) => <span className="tabular">{formatQty(v)}</span>;
const countNode = (v: number) => <span className="tabular">{formatNumber(v)}</span>;
const pctNode = (v: number) => <span className="tabular">{v.toFixed(1)}%</span>;

// ---- Sales ------------------------------------------------------------------------------------

export function SalesSummaryTable({ rows, totals, group }: { rows: SalesSummaryRow[]; totals: Omit<SalesSummaryRow, "period">; group: "day" | "month" }) {
  const columns: Col<SalesSummaryRow>[] = [
    {
      accessorKey: "period",
      header: group === "month" ? "Month" : "Date",
      cell: ({ getValue }) => <span className="font-medium whitespace-nowrap">{group === "month" ? monthLabel(String(getValue())) : formatDate(String(getValue()))}</span>,
    },
    count("invoices", "Invoices"),
    money("gross", "Gross"),
    money("discounts", "Discounts", { muteZero: true }),
    money("net", "Net sales"),
    money("tax", "Tax", { muteZero: true }),
    money("returns", "Returns", { muteZero: true, tone: "danger" }),
    money("netAfterReturns", "Net after returns", { className: "font-medium" }),
    money("total", "Invoiced (incl. tax)"),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="sales-summary"
      pageSize={500}
      initialSorting={[{ id: "period", desc: false }]}
      emptyTitle="No sales in this period"
      emptyDescription="Only posted invoices and returns are counted. Try a wider date range."
      footer={<TotalsRow columns={columns} values={{ invoices: countNode(totals.invoices), gross: totals.gross, discounts: totals.discounts, net: totals.net, tax: totals.tax, returns: totals.returns, netAfterReturns: totals.netAfterReturns, total: totals.total }} />}
    />
  );
}

export function SalesByProductTable({ rows, totals, showCost }: { rows: SalesByProductRow[]; totals: { revenue: number; cost: number; profit: number; margin: number }; showCost: boolean }) {
  const columns: Col<SalesByProductRow>[] = [
    text("name", "Product", { strong: true }),
    text("sku", "SKU", { className: "text-muted-foreground" }),
    text("category", "Category"),
    qty("qty", "Sold", "unit"),
    qty("returnedQty", "Returned"),
    money("revenue", "Revenue", { className: "font-medium" }),
    ...(showCost ? [money<SalesByProductRow>("cost", "Cost"), money<SalesByProductRow>("profit", "Profit"), percent<SalesByProductRow>("margin", "Margin", { signed: true })] : []),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="sales-by-product"
      pageSize={500}
      searchPlaceholder="Search products…"
      rowHref={(r) => (r.productId ? `/inventory/products/${r.productId}` : null)}
      emptyTitle="No products sold in this period"
      footer={<TotalsRow columns={columns} values={{ revenue: totals.revenue, cost: totals.cost, profit: totals.profit, margin: pctNode(totals.margin) }} />}
    />
  );
}

export function SalesByCustomerTable({ rows, totals }: { rows: SalesByCustomerRow[]; totals: Record<string, number> }) {
  const columns: Col<SalesByCustomerRow>[] = [
    text("name", "Customer", { strong: true }),
    text("code", "Code", { className: "text-muted-foreground" }),
    count("invoices", "Invoices"),
    money("net", "Net sales"),
    money("tax", "Tax", { muteZero: true }),
    money("returns", "Returns", { muteZero: true, tone: "danger" }),
    money("netAfterReturns", "Net after returns", { className: "font-medium" }),
    money("outstanding", "Unpaid", { muteZero: true, tone: "danger" }),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="sales-by-customer"
      pageSize={500}
      searchPlaceholder="Search customers…"
      rowHref={(r) => (r.customerId ? `/sales/customers/${r.customerId}` : null)}
      emptyTitle="No customer sales in this period"
      footer={
        <TotalsRow
          columns={columns}
          values={{ invoices: countNode(totals.invoices), net: totals.net, tax: totals.tax, returns: totals.returns, netAfterReturns: totals.netAfterReturns, outstanding: totals.outstanding }}
        />
      }
    />
  );
}

export function SalesByCategoryTable({ rows, totals, showCost }: { rows: SalesByCategoryRow[]; totals: { revenue: number; cost: number; profit: number; margin: number }; showCost: boolean }) {
  const columns: Col<SalesByCategoryRow>[] = [
    text("name", "Category", { strong: true }),
    count("products", "Products"),
    qty("qty", "Qty sold"),
    money("revenue", "Revenue", { className: "font-medium" }),
    ...(showCost ? [money<SalesByCategoryRow>("cost", "Cost"), money<SalesByCategoryRow>("profit", "Profit"), percent<SalesByCategoryRow>("margin", "Margin", { signed: true })] : []),
    percent("share", "Share", { bar: true }),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="sales-by-category"
      pageSize={500}
      emptyTitle="No category sales in this period"
      footer={<TotalsRow columns={columns} values={{ revenue: totals.revenue, cost: totals.cost, profit: totals.profit, margin: pctNode(totals.margin), share: pctNode(rows.length ? 100 : 0) }} />}
    />
  );
}

export function SalesBySalespersonTable({ rows, totals, showCost }: { rows: SalesBySalespersonRow[]; totals: Record<string, number>; showCost: boolean }) {
  const columns: Col<SalesBySalespersonRow>[] = [
    text("name", "Salesperson", { strong: true }),
    count("invoices", "Invoices"),
    money("net", "Net sales"),
    money("returns", "Returns", { muteZero: true, tone: "danger" }),
    money("netAfterReturns", "Net after returns", { className: "font-medium" }),
    money("average", "Avg. invoice"),
    ...(showCost ? [money<SalesBySalespersonRow>("profit", "Gross profit"), percent<SalesBySalespersonRow>("margin", "Margin", { signed: true })] : []),
    percent("share", "Share", { bar: true }),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="sales-by-salesperson"
      pageSize={500}
      emptyTitle="No sales in this period"
      emptyDescription="The salesperson typed on each invoice is used. Invoices without one are grouped as Unassigned."
      footer={<TotalsRow columns={columns} values={{ invoices: countNode(totals.invoices), net: totals.net, returns: totals.returns, netAfterReturns: totals.netAfterReturns, profit: totals.profit }} />}
    />
  );
}

// ---- Purchasing -------------------------------------------------------------------------------

export function PurchasesBySupplierTable({ rows, totals }: { rows: PurchasesBySupplierRow[]; totals: Record<string, number> }) {
  const columns: Col<PurchasesBySupplierRow>[] = [
    text("name", "Supplier", { strong: true }),
    text("code", "Code", { className: "text-muted-foreground" }),
    count("bills", "Bills"),
    money("net", "Net"),
    money("tax", "Tax", { muteZero: true }),
    money("freight", "Freight", { muteZero: true }),
    money("total", "Billed", { className: "font-medium" }),
    money("returns", "Returns", { muteZero: true }),
    money("outstanding", "Unpaid", { muteZero: true, tone: "danger" }),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="purchases-by-supplier"
      pageSize={500}
      searchPlaceholder="Search suppliers…"
      rowHref={(r) => `/purchasing/suppliers/${r.supplierId}`}
      emptyTitle="No supplier bills in this period"
      emptyDescription="Only posted supplier bills and purchase returns are counted."
      footer={<TotalsRow columns={columns} values={{ bills: countNode(totals.bills), net: totals.net, tax: totals.tax, freight: totals.freight, total: totals.total, returns: totals.returns, outstanding: totals.outstanding }} />}
    />
  );
}

export function PurchasesByProductTable({ rows, totals }: { rows: PurchasesByProductRow[]; totals: { value: number } }) {
  const columns: Col<PurchasesByProductRow>[] = [
    text("name", "Product", { strong: true }),
    text("sku", "SKU", { className: "text-muted-foreground" }),
    count("bills", "Bills"),
    qty("qty", "Qty bought", "unit"),
    qty("returnedQty", "Returned"),
    money("avgCost", "Avg. cost"),
    money("value", "Net value", { className: "font-medium" }),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="purchases-by-product"
      pageSize={500}
      searchPlaceholder="Search products…"
      rowHref={(r) => (r.productId ? `/inventory/products/${r.productId}` : null)}
      emptyTitle="Nothing purchased in this period"
      footer={<TotalsRow columns={columns} values={{ value: totals.value }} />}
    />
  );
}

// ---- Inventory --------------------------------------------------------------------------------

function GroupTable({ rows, label, exportName, total }: { rows: ValuationGroup[]; label: string; exportName: string; total: number }) {
  const columns: Col<ValuationGroup>[] = [text("name", label, { strong: true }), count("products", "Products"), qty("qty", "Quantity"), money("value", "Value", { className: "font-medium" }), percent("share", "Share", { bar: true })];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName={exportName}
      pageSize={500}
      emptyTitle="No stock on hand"
      footer={<TotalsRow columns={columns} values={{ value: total, share: pctNode(rows.length ? 100 : 0) }} />}
    />
  );
}

export function ValuationTables({ items, byWarehouse, byCategory, total }: { items: ValuationItem[]; byWarehouse: ValuationGroup[]; byCategory: ValuationGroup[]; total: number }) {
  const columns: Col<ValuationItem>[] = [
    text("name", "Product", { strong: true }),
    text("sku", "SKU", { className: "text-muted-foreground" }),
    text("category", "Category"),
    text("warehouse", "Warehouse"),
    qty("qty", "On hand", "unit"),
    money("avgCost", "Avg. cost"),
    money("value", "Value", { className: "font-medium" }),
  ];
  return (
    <Tabs defaultValue="products" className="gap-3">
      <TabsList className="no-print">
        <TabsTrigger value="products">By product</TabsTrigger>
        <TabsTrigger value="warehouse">By warehouse</TabsTrigger>
        <TabsTrigger value="category">By category</TabsTrigger>
      </TabsList>
      <TabsContent value="products">
        <DataTable
          columns={columns}
          data={items}
          exportName="inventory-valuation"
          pageSize={500}
          searchPlaceholder="Search products…"
          rowHref={(r) => `/inventory/products/${r.productId}`}
          emptyTitle="No stock on hand"
          emptyDescription="Stock appears here once goods are received or opening stock is entered."
          footer={<TotalsRow columns={columns} values={{ value: total }} />}
        />
      </TabsContent>
      <TabsContent value="warehouse">
        <GroupTable rows={byWarehouse} label="Warehouse" exportName="inventory-valuation-by-warehouse" total={total} />
      </TabsContent>
      <TabsContent value="category">
        <GroupTable rows={byCategory} label="Category" exportName="inventory-valuation-by-category" total={total} />
      </TabsContent>
    </Tabs>
  );
}

export function ReorderTable({ rows, showCost, estimatedCost }: { rows: ReorderRow[]; showCost: boolean; estimatedCost: number }) {
  const columns: Col<ReorderRow>[] = [
    text("name", "Product", { strong: true }),
    text("sku", "SKU", { className: "text-muted-foreground" }),
    text("category", "Category"),
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => <StatusBadge status={String(getValue())}>{getValue() === "out" ? "Out of stock" : "Low"}</StatusBadge>,
    },
    qty("onHand", "On hand", "unit"),
    qty("reorderLevel", "Reorder level"),
    qty("onOrder", "On order"),
    {
      accessorKey: "suggested",
      header: "Suggested order",
      meta: right,
      cell: ({ row }) => (
        <span className="tabular font-semibold text-primary">
          {formatQty(row.original.suggested)} <span className="text-xs font-normal text-muted-foreground">{row.original.unit}</span>
        </span>
      ),
    },
    ...(showCost ? [money<ReorderRow>("lastCost", "Last cost"), money<ReorderRow>("estimatedCost", "Est. cost")] : []),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="reorder-list"
      pageSize={500}
      searchPlaceholder="Search products…"
      rowHref={(r) => `/inventory/products/${r.productId}`}
      emptyTitle="Nothing to reorder"
      emptyDescription="No product is at or below its reorder level. Set reorder levels on products to use this list."
      footer={showCost ? <TotalsRow columns={columns} values={{ estimatedCost }} /> : undefined}
    />
  );
}

export function StockMovementTable({ rows, totals, showCost }: { rows: StockMovementRow[]; totals: { inQty: number; outQty: number; closingValue: number }; showCost: boolean }) {
  const columns: Col<StockMovementRow>[] = [
    text("name", "Product", { strong: true }),
    text("sku", "SKU", { className: "text-muted-foreground" }),
    qty("opening", "Opening", "unit"),
    {
      accessorKey: "inQty",
      header: "In",
      meta: right,
      cell: ({ getValue }) => <span className={cn("tabular", Number(getValue()) > 0 && "text-success")}>{Number(getValue()) > 0 ? `+${formatQty(getValue() as number)}` : "—"}</span>,
    },
    {
      accessorKey: "outQty",
      header: "Out",
      meta: right,
      cell: ({ getValue }) => <span className={cn("tabular", Number(getValue()) > 0 && "text-destructive")}>{Number(getValue()) > 0 ? `−${formatQty(getValue() as number)}` : "—"}</span>,
    },
    { accessorKey: "closing", header: "Closing", meta: right, cell: ({ row }) => <span className="tabular font-medium">{formatQty(row.original.closing)} <span className="text-xs font-normal text-muted-foreground">{row.original.unit}</span></span> },
    ...(showCost ? [money<StockMovementRow>("closingValue", "Closing value")] : []),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="stock-movement-summary"
      pageSize={500}
      searchPlaceholder="Search products…"
      rowHref={(r) => `/inventory/products/${r.productId}`}
      emptyTitle="No stock movement"
      emptyDescription="Nothing was received, sold or adjusted in this period."
      footer={<TotalsRow columns={columns} values={{ inQty: qtyNode(totals.inQty), outQty: qtyNode(totals.outQty), closingValue: totals.closingValue }} />}
    />
  );
}

// ---- Finance ----------------------------------------------------------------------------------

export function AgedTable({ rows, totals, kind }: { rows: AgedRow[]; totals: Record<string, number>; kind: "customer" | "supplier" }) {
  const columns: Col<AgedRow>[] = [
    text("name", kind === "customer" ? "Customer" : "Supplier", { strong: true }),
    count("documents", kind === "customer" ? "Invoices" : "Bills"),
    money("current", "Current", { muteZero: true }),
    money("d1_30", "1–30 days", { muteZero: true }),
    money("d31_60", "31–60 days", { muteZero: true }),
    money("d61_90", "61–90 days", { muteZero: true }),
    money("d90", "90+ days", { muteZero: true, tone: "danger" }),
    money("total", "Total due", { className: "font-semibold" }),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName={kind === "customer" ? "aged-receivables" : "aged-payables"}
      pageSize={500}
      searchPlaceholder={kind === "customer" ? "Search customers…" : "Search suppliers…"}
      rowHref={(r) => (r.partyId ? (kind === "customer" ? `/sales/customers/${r.partyId}` : `/purchasing/suppliers/${r.partyId}`) : null)}
      emptyTitle={kind === "customer" ? "No unpaid invoices" : "No unpaid bills"}
      emptyDescription={kind === "customer" ? "Every posted customer invoice is fully paid." : "Every posted supplier bill is fully paid."}
      footer={<TotalsRow columns={columns} values={{ documents: countNode(totals.documents), current: totals.current, d1_30: totals.d1_30, d31_60: totals.d31_60, d61_90: totals.d61_90, d90: totals.d90, total: totals.total }} />}
    />
  );
}

export function TaxTable({ rows, output, input, net }: { rows: TaxRow[]; output: number; input: number; net: number }) {
  const columns: Col<TaxRow>[] = [
    text("source", "Source", { strong: true }),
    {
      accessorKey: "kind",
      header: "Type",
      cell: ({ getValue }) => <StatusBadge status={getValue() === "output" ? "sent" : "partial"}>{getValue() === "output" ? "Output tax" : "Input tax"}</StatusBadge>,
    },
    count("documents", "Documents"),
    money("taxable", "Taxable value"),
    money("tax", "Tax", { className: "font-medium" }),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="tax-summary"
      pageSize={50}
      footer={
        <>
          <TotalsRow columns={columns} label="Output tax" values={{ tax: output }} />
          <TotalsRow columns={columns} label="Less input tax" values={{ tax: input }} />
          <TotalsRow
            columns={columns}
            label={net >= 0 ? "Net tax payable" : "Net tax refundable"}
            values={{ tax: <Money value={Math.abs(net)} className={net > 0 ? "text-destructive" : "text-success"} /> }}
          />
        </>
      }
    />
  );
}

export function ExpenseTable({ rows, total }: { rows: ExpenseRow[]; total: number }) {
  const columns: Col<ExpenseRow>[] = [
    text("code", "Code", { className: "text-muted-foreground w-20" }),
    text("name", "Expense account", { strong: true }),
    text("group", "Group"),
    money("amount", "Amount", { className: "font-medium" }),
    percent("share", "Share", { bar: true }),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="expenses-by-category"
      pageSize={500}
      searchPlaceholder="Search accounts…"
      rowHref={(r) => `/accounting/ledger?account=${r.accountId}`}
      emptyTitle="No expenses in this period"
      emptyDescription="Posted expenses, bills to expense accounts, payroll and cost of sales appear here."
      footer={<TotalsRow columns={columns} values={{ amount: total, share: pctNode(rows.length ? 100 : 0) }} />}
    />
  );
}

export function DailyCashTable({ rows, receipts, payments, closing }: { rows: DailyCashRow[]; receipts: number; payments: number; closing: number }) {
  const columns: Col<DailyCashRow>[] = [
    { accessorKey: "date", header: "Date", cell: ({ getValue }) => <span className="font-medium whitespace-nowrap">{formatDate(String(getValue()))}</span> },
    count("entries", "Entries"),
    money("opening", "Opening"),
    money("receipts", "Receipts", { muteZero: true, className: "text-success" }),
    money("payments", "Payments", { muteZero: true, className: "text-destructive" }),
    money("closing", "Closing", { className: "font-semibold" }),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="daily-cash"
      pageSize={500}
      initialSorting={[{ id: "date", desc: false }]}
      emptyTitle="No cash or bank movement"
      emptyDescription="Receipts, payments and transfers through cash, bank and petty cash accounts appear here."
      footer={<TotalsRow columns={columns} values={{ receipts, payments, closing }} />}
    />
  );
}

// ---- HR ---------------------------------------------------------------------------------------

export function PayrollTable({ rows, totals }: { rows: PayrollRow[]; totals: Record<string, number> }) {
  const columns: Col<PayrollRow>[] = [
    { accessorKey: "period", header: "Month", cell: ({ getValue }) => <span className="font-medium whitespace-nowrap">{monthLabel(String(getValue()))}</span> },
    text("number", "Run", { className: "text-muted-foreground" }),
    count("employees", "Employees"),
    money("gross", "Gross"),
    money("deductions", "Deductions", { muteZero: true }),
    money("net", "Net pay", { className: "font-medium" }),
    money("paid", "Paid", { className: "text-success" }),
    money("outstanding", "Unpaid", { muteZero: true, tone: "danger" }),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="payroll-summary"
      pageSize={500}
      rowHref={(r) => `/hr/payroll/${r.id}`}
      emptyTitle="No posted payroll in this period"
      emptyDescription="Payroll runs appear here once they are posted."
      footer={<TotalsRow columns={columns} values={{ gross: totals.gross, deductions: totals.deductions, net: totals.net, paid: totals.paid, outstanding: totals.outstanding }} />}
    />
  );
}

