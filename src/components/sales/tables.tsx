"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/format";
import { CUSTOMER_TYPE_LABEL, METHOD_LABEL } from "./common";

const right = { align: "right" as const };

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}

function NewButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild size="sm">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

// ---- Invoices ---------------------------------------------------------------------------------

export interface InvoiceListRow {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  channel: "pos" | "invoice";
  customerName: string;
  warehouse?: string | null;
  status: string;
  paymentStatus: string;
  total: number;
  amountPaid: number;
  balance: number;
  overdue: boolean;
}

export function InvoicesTable({ data, exportName = "invoices", compact }: { data: InvoiceListRow[]; exportName?: string; compact?: boolean }) {
  const columns: ColumnDef<InvoiceListRow, unknown>[] = [
    { accessorKey: "number", header: "Number", cell: ({ row }) => <DocLink href={`/sales/invoices/${row.original.id}`}>{row.original.number}</DocLink> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    ...(compact
      ? []
      : ([
          {
            accessorKey: "customerName",
            header: "Customer",
            cell: ({ row }) => (
              <div className="flex items-center gap-2">
                <span className="max-w-56 truncate">{row.original.customerName}</span>
                {row.original.channel === "pos" && <StatusBadge status="sent">POS</StatusBadge>}
              </div>
            ),
          },
        ] as ColumnDef<InvoiceListRow, unknown>[])),
    { accessorKey: "dueDate", header: "Due", cell: ({ row }) => (row.original.dueDate ? formatDate(row.original.dueDate) : "—") },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      accessorKey: "paymentStatus",
      header: "Payment",
      cell: ({ row }) =>
        row.original.status !== "posted" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <StatusBadge status={row.original.overdue ? "overdue" : row.original.paymentStatus} />
        ),
      meta: { csv: (r: unknown) => ((r as InvoiceListRow).overdue ? "overdue" : (r as InvoiceListRow).paymentStatus) },
    },
    { accessorKey: "total", header: "Total", cell: ({ row }) => <Money value={row.original.total} />, meta: right },
    { accessorKey: "balance", header: "Balance", cell: ({ row }) => <Money value={row.original.balance} muteZero />, meta: right },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search number or customer…"
      exportName={exportName}
      rowHref={(r) => `/sales/invoices/${r.id}`}
      emptyTitle="No invoices in this period"
      emptyDescription="Invoices record what you sold, reduce stock and post to the books. Counter sales from the POS show up here too."
      emptyAction={<NewButton href="/sales/invoices/new" label="New invoice" />}
    />
  );
}

// ---- Quotations -------------------------------------------------------------------------------

export interface QuotationListRow {
  id: string;
  number: string;
  date: string;
  validUntil: string | null;
  customerName: string;
  status: string;
  displayStatus: string;
  total: number;
}

export function QuotationsTable({ data }: { data: QuotationListRow[] }) {
  const columns: ColumnDef<QuotationListRow, unknown>[] = [
    { accessorKey: "number", header: "Number", cell: ({ row }) => <DocLink href={`/sales/quotations/${row.original.id}`}>{row.original.number}</DocLink> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: "customerName", header: "Customer" },
    { accessorKey: "validUntil", header: "Valid until", cell: ({ row }) => (row.original.validUntil ? formatDate(row.original.validUntil) : "—") },
    { accessorKey: "displayStatus", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.displayStatus} /> },
    { accessorKey: "total", header: "Total", cell: ({ row }) => <Money value={row.original.total} />, meta: right },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search number or customer…"
      exportName="quotations"
      rowHref={(r) => `/sales/quotations/${r.id}`}
      emptyTitle="No quotations in this period"
      emptyDescription="Send customers a priced offer, then turn it into a sales order or invoice in one click when they accept."
      emptyAction={<NewButton href="/sales/quotations/new" label="New quotation" />}
    />
  );
}

// ---- Orders -----------------------------------------------------------------------------------

export interface OrderListRow {
  id: string;
  number: string;
  date: string;
  deliveryDate: string | null;
  customerName: string;
  status: string;
  total: number;
  fulfilledPct: number;
}

export function OrdersTable({ data }: { data: OrderListRow[] }) {
  const columns: ColumnDef<OrderListRow, unknown>[] = [
    { accessorKey: "number", header: "Number", cell: ({ row }) => <DocLink href={`/sales/orders/${row.original.id}`}>{row.original.number}</DocLink> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: "customerName", header: "Customer" },
    { accessorKey: "deliveryDate", header: "Delivery", cell: ({ row }) => (row.original.deliveryDate ? formatDate(row.original.deliveryDate) : "—") },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      accessorKey: "fulfilledPct",
      header: "Invoiced",
      cell: ({ row }) => (
        <div className="flex min-w-32 items-center gap-2">
          <Progress value={row.original.fulfilledPct} className="h-1.5" />
          <span className="w-10 text-right text-xs tabular text-muted-foreground">{Math.round(row.original.fulfilledPct)}%</span>
        </div>
      ),
      meta: { csv: (r: unknown) => Math.round((r as OrderListRow).fulfilledPct) },
    },
    { accessorKey: "total", header: "Total", cell: ({ row }) => <Money value={row.original.total} />, meta: right },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search number or customer…"
      exportName="sales-orders"
      rowHref={(r) => `/sales/orders/${r.id}`}
      emptyTitle="No sales orders in this period"
      emptyDescription="Book customer orders now and invoice them in one go or in parts as goods are delivered."
      emptyAction={<NewButton href="/sales/orders/new" label="New sales order" />}
    />
  );
}

// ---- Receipts ---------------------------------------------------------------------------------

export interface ReceiptListRow {
  id: string;
  number: string;
  date: string;
  customerName: string;
  method: string;
  account: string | null;
  reference: string | null;
  amount: number;
  unallocated: number;
  status: string;
}

export function ReceiptsTable({ data, compact }: { data: ReceiptListRow[]; compact?: boolean }) {
  const columns: ColumnDef<ReceiptListRow, unknown>[] = [
    { accessorKey: "number", header: "Number", cell: ({ row }) => <DocLink href={`/sales/receipts/${row.original.id}`}>{row.original.number}</DocLink> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    ...(compact ? [] : ([{ accessorKey: "customerName", header: "Customer" }] as ColumnDef<ReceiptListRow, unknown>[])),
    { accessorKey: "method", header: "Method", cell: ({ row }) => METHOD_LABEL[row.original.method] ?? row.original.method },
    { accessorKey: "account", header: "Deposited to", cell: ({ row }) => row.original.account ?? "—" },
    { accessorKey: "reference", header: "Reference", cell: ({ row }) => row.original.reference ?? "—" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <Money value={row.original.amount} />, meta: right },
    {
      accessorKey: "unallocated",
      header: "On account",
      cell: ({ row }) => <Money value={row.original.status === "posted" ? row.original.unallocated : 0} muteZero />,
      meta: right,
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search number, customer or reference…"
      exportName="customer-receipts"
      rowHref={(r) => `/sales/receipts/${r.id}`}
      emptyTitle="No receipts in this period"
      emptyDescription="Record money received from customers and settle their open invoices. POS payments are recorded automatically."
      emptyAction={<NewButton href="/sales/receipts/new" label="Record receipt" />}
    />
  );
}

// ---- Returns ----------------------------------------------------------------------------------

export interface ReturnListRow {
  id: string;
  number: string;
  date: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  customerName: string;
  settlement: string;
  status: string;
  total: number;
}

export function ReturnsTable({ data }: { data: ReturnListRow[] }) {
  const columns: ColumnDef<ReturnListRow, unknown>[] = [
    { accessorKey: "number", header: "Number", cell: ({ row }) => <DocLink href={`/sales/returns/${row.original.id}`}>{row.original.number}</DocLink> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    {
      accessorKey: "invoiceNumber",
      header: "Invoice",
      cell: ({ row }) => (row.original.invoiceId ? <DocLink href={`/sales/invoices/${row.original.invoiceId}`}>{row.original.invoiceNumber}</DocLink> : "—"),
    },
    { accessorKey: "customerName", header: "Customer" },
    {
      accessorKey: "settlement",
      header: "Settlement",
      cell: ({ row }) => (row.original.settlement === "refund" ? "Refund" : "Credit to account"),
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: "total", header: "Total", cell: ({ row }) => <Money value={row.original.total} />, meta: right },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search number, invoice or customer…"
      exportName="sales-returns"
      rowHref={(r) => `/sales/returns/${r.id}`}
      emptyTitle="No returns in this period"
      emptyDescription="When a customer brings goods back, create a return from the invoice: stock comes back and the customer is credited or refunded."
      emptyAction={<NewButton href="/sales/returns/new" label="New return" />}
    />
  );
}

// ---- Customers --------------------------------------------------------------------------------

export interface CustomerListRow {
  id: string;
  code: string;
  name: string;
  type: string;
  phone: string | null;
  city: string | null;
  balance: number;
  overdue: number;
  creditLimit: number;
  isActive: boolean;
}

export function CustomersTable({ data }: { data: CustomerListRow[] }) {
  const columns: ColumnDef<CustomerListRow, unknown>[] = [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.code}</span> },
    { accessorKey: "name", header: "Name", cell: ({ row }) => <DocLink href={`/sales/customers/${row.original.id}`}>{row.original.name}</DocLink> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => CUSTOMER_TYPE_LABEL[row.original.type] ?? row.original.type },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => row.original.phone ?? "—" },
    { accessorKey: "city", header: "City", cell: ({ row }) => row.original.city ?? "—" },
    {
      accessorKey: "balance",
      header: "Balance owed",
      cell: ({ row }) => (
        <div className="flex flex-col items-end">
          <Money value={row.original.balance} muteZero className={row.original.balance < 0 ? "text-success" : undefined} />
          {row.original.overdue > 0 && <span className="text-[11px] text-destructive">Overdue {Math.round(row.original.overdue).toLocaleString()}</span>}
        </div>
      ),
      meta: right,
    },
    { accessorKey: "creditLimit", header: "Credit limit", cell: ({ row }) => <Money value={row.original.creditLimit} muteZero />, meta: right },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.isActive ? "active" : "inactive"} />,
      meta: { csv: (r: unknown) => ((r as CustomerListRow).isActive ? "active" : "inactive") },
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search name, code, phone or city…"
      exportName="customers"
      rowHref={(r) => `/sales/customers/${r.id}`}
      emptyTitle="No customers yet"
      emptyDescription="Add the people and businesses you sell to. Their balances, statements and credit limits come straight from the books."
      emptyAction={<NewButton href="/sales/customers/new" label="New customer" />}
    />
  );
}
