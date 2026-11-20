"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { formatDate, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import type { BillRow, PaymentRow, PurchaseOrderRow, ReceiptRow, ReturnRow } from "@/server/queries/purchasing";
import type { SupplierRow } from "@/server/queries/suppliers";
import { paymentMethodLabel } from "./doc-lines";

type Col<T> = ColumnDef<T, unknown>;

const numberCol = <T extends { id: string; number: string }>(base: string): Col<T> => ({
  accessorKey: "number",
  header: "Number",
  cell: ({ row }) => (
    <Link href={`${base}/${row.original.id}`} className="font-medium text-primary hover:underline">
      {row.original.number}
    </Link>
  ),
});

const dateCol = <T,>(key: keyof T & string, header = "Date"): Col<T> => ({
  accessorKey: key,
  header,
  cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue() as string)}</span>,
});

const moneyCol = <T,>(key: keyof T & string, header: string, opts: { muteZero?: boolean } = {}): Col<T> => ({
  accessorKey: key,
  header,
  meta: { align: "right" },
  cell: ({ getValue }) => <Money value={getValue() as number} muteZero={opts.muteZero} />,
});

const supplierCol = <T extends { supplierId: string; supplierName: string }>(): Col<T> => ({
  accessorKey: "supplierName",
  header: "Supplier",
  cell: ({ row }) => (
    <Link href={`/purchasing/suppliers/${row.original.supplierId}`} className="hover:text-primary hover:underline">
      {row.original.supplierName}
    </Link>
  ),
});

function StatusFilter({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useFiltered<T>(data: T[], pick: (row: T, filter: string) => boolean, initial = "all") {
  const [filter, setFilter] = useState(initial);
  const rows = useMemo(() => (filter === "all" ? data : data.filter((r) => pick(r, filter))), [data, filter, pick]);
  return { filter, setFilter, rows };
}

const createButton = (href: string, label: string) => (
  <Button asChild size="sm">
    <Link href={href}>
      <Plus className="size-4" />
      {label}
    </Link>
  </Button>
);

/** First-run empty state, or a plain message when a filter hides every row. */
function emptyProps(total: number, shown: number, title: string, description: string, action?: React.ReactNode) {
  return total > 0 && shown === 0
    ? { emptyTitle: "Nothing matches this filter", emptyDescription: "Choose another status to see more records." }
    : { emptyTitle: title, emptyDescription: description, emptyAction: action };
}

// ---- Purchase orders ------------------------------------------------------------------------

const PO_FILTERS = [
  { value: "open", label: "Open (to receive)" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
  { value: "partial", label: "Partly received" },
  { value: "received", label: "Received" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];
const pickPo = (r: PurchaseOrderRow, f: string) => (f === "open" ? ["approved", "sent", "partial"].includes(r.status) : r.status === f);

export function PurchaseOrdersTable({ data, hideSupplier, canCreate }: { data: PurchaseOrderRow[]; hideSupplier?: boolean; canCreate?: boolean }) {
  const { filter, setFilter, rows } = useFiltered(data, pickPo);
  const t = today();
  const columns = useMemo<Col<PurchaseOrderRow>[]>(
    () => [
      numberCol("/purchasing/orders"),
      dateCol("date"),
      ...(hideSupplier ? [] : [supplierCol<PurchaseOrderRow>()]),
      { accessorKey: "warehouseName", header: "Deliver to" },
      {
        accessorKey: "expectedDate",
        header: "Expected",
        cell: ({ row }) => {
          const r = row.original;
          const late = r.expectedDate && r.expectedDate < t && ["approved", "sent", "partial"].includes(r.status);
          return <span className={cn("whitespace-nowrap", late && "font-medium text-destructive")}>{r.expectedDate ? formatDate(r.expectedDate) : "—"}</span>;
        },
      },
      {
        accessorKey: "receivedPct",
        header: "Received",
        cell: ({ row }) => (
          <div className="flex min-w-28 items-center gap-2">
            <Progress value={row.original.receivedPct} className="h-1.5" />
            <span className="w-9 text-right text-xs tabular text-muted-foreground">{row.original.receivedPct}%</span>
          </div>
        ),
      },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      moneyCol("total", "Total"),
    ],
    [hideSupplier, t]
  );
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="purchase-orders"
      searchPlaceholder="Search number, supplier…"
      rowHref={(r) => `/purchasing/orders/${r.id}`}
      toolbar={<StatusFilter value={filter} onChange={setFilter} options={PO_FILTERS} />}
      {...emptyProps(data.length, rows.length, "No purchase orders yet", "Raise a purchase order to tell a supplier what you need, then receive the goods against it.", canCreate ? createButton("/purchasing/orders/new", "New purchase order") : undefined)}
    />
  );
}

// ---- Goods receipts -------------------------------------------------------------------------

const GRN_FILTERS = [
  { value: "draft", label: "Draft" },
  { value: "unbilled", label: "Not fully billed" },
  { value: "billed", label: "Billed" },
  { value: "void", label: "Void" },
];
const pickGrn = (r: ReceiptRow, f: string) =>
  f === "unbilled" ? r.status === "posted" && r.billStatus !== "billed" : f === "billed" ? r.status === "posted" && r.billStatus === "billed" : r.status === f;

export function ReceiptsTable({ data, hideSupplier, canCreate }: { data: ReceiptRow[]; hideSupplier?: boolean; canCreate?: boolean }) {
  const { filter, setFilter, rows } = useFiltered(data, pickGrn);
  const columns = useMemo<Col<ReceiptRow>[]>(
    () => [
      numberCol("/purchasing/receipts"),
      dateCol("date"),
      ...(hideSupplier ? [] : [supplierCol<ReceiptRow>()]),
      {
        accessorKey: "poNumber",
        header: "PO",
        cell: ({ row }) =>
          row.original.purchaseOrderId ? (
            <Link href={`/purchasing/orders/${row.original.purchaseOrderId}`} className="hover:text-primary hover:underline">
              {row.original.poNumber}
            </Link>
          ) : (
            <span className="text-muted-foreground">Direct</span>
          ),
      },
      { accessorKey: "supplierDeliveryRef", header: "Delivery ref", cell: ({ getValue }) => (getValue() as string) || "—" },
      { accessorKey: "warehouseName", header: "Warehouse" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex gap-1">
            <StatusBadge status={row.original.status} />
            {row.original.status === "posted" && <StatusBadge status={row.original.billStatus} />}
          </div>
        ),
      },
      moneyCol("unbilledValue", "Unbilled", { muteZero: true }),
      moneyCol("totalValue", "Value"),
    ],
    [hideSupplier]
  );
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="goods-receipts"
      searchPlaceholder="Search number, supplier, PO…"
      rowHref={(r) => `/purchasing/receipts/${r.id}`}
      toolbar={<StatusFilter value={filter} onChange={setFilter} options={GRN_FILTERS} />}
      {...emptyProps(data.length, rows.length, "No goods received yet", "Record a goods receipt when a delivery arrives. It adds the stock and waits for the supplier's bill.", canCreate ? createButton("/purchasing/receipts/new", "Receive goods") : undefined)}
    />
  );
}

// ---- Bills ----------------------------------------------------------------------------------

const BILL_FILTERS = [
  { value: "draft", label: "Draft" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partly paid" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];
const pickBill = (r: BillRow, f: string) =>
  f === "draft" || f === "void" ? r.status === f : f === "overdue" ? r.overdue : r.status === "posted" && r.paymentStatus === f;

export function BillsTable({ data, hideSupplier, canCreate }: { data: BillRow[]; hideSupplier?: boolean; canCreate?: boolean }) {
  const { filter, setFilter, rows } = useFiltered(data, pickBill);
  const columns = useMemo<Col<BillRow>[]>(
    () => [
      numberCol("/purchasing/bills"),
      { accessorKey: "supplierInvoiceNo", header: "Supplier inv #", cell: ({ getValue }) => (getValue() as string) || "—" },
      dateCol("date"),
      ...(hideSupplier ? [] : [supplierCol<BillRow>()]),
      {
        accessorKey: "dueDate",
        header: "Due",
        cell: ({ row }) => (
          <span className={cn("whitespace-nowrap", row.original.overdue && "font-medium text-destructive")}>{formatDate(row.original.dueDate)}</span>
        ),
      },
      {
        id: "state",
        header: "Status",
        accessorFn: (r) => (r.status === "posted" ? (r.overdue ? "overdue" : r.paymentStatus) : r.status),
        cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
      },
      moneyCol("total", "Total"),
      moneyCol("outstanding", "Balance due", { muteZero: true }),
    ],
    [hideSupplier]
  );
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="supplier-bills"
      searchPlaceholder="Search bill, invoice no, supplier…"
      rowHref={(r) => `/purchasing/bills/${r.id}`}
      toolbar={<StatusFilter value={filter} onChange={setFilter} options={BILL_FILTERS} />}
      {...emptyProps(data.length, rows.length, "No supplier bills yet", "Enter the supplier's invoice as a bill. Bill a goods receipt, a purchase order, or record a direct bill.", canCreate ? createButton("/purchasing/bills/new", "New bill") : undefined)}
    />
  );
}

// ---- Payments -------------------------------------------------------------------------------

export function PaymentsTable({ data, hideSupplier, canCreate }: { data: PaymentRow[]; hideSupplier?: boolean; canCreate?: boolean }) {
  const columns = useMemo<Col<PaymentRow>[]>(
    () => [
      numberCol("/purchasing/payments"),
      dateCol("date"),
      ...(hideSupplier ? [] : [supplierCol<PaymentRow>()]),
      { accessorKey: "method", header: "Method", cell: ({ getValue }) => paymentMethodLabel(getValue() as string) },
      { accessorKey: "accountName", header: "Paid from" },
      { accessorKey: "reference", header: "Reference", cell: ({ getValue }) => (getValue() as string) || "—" },
      { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
      {
        id: "unallocated",
        header: "Advance",
        meta: { align: "right" },
        accessorFn: (r) => Math.max(r.amount - r.allocated, 0),
        cell: ({ getValue }) => <Money value={getValue() as number} muteZero />,
      },
      moneyCol("amount", "Amount"),
    ],
    [hideSupplier]
  );
  return (
    <DataTable
      columns={columns}
      data={data}
      exportName="supplier-payments"
      searchPlaceholder="Search number, supplier, reference…"
      rowHref={(r) => `/purchasing/payments/${r.id}`}
      {...emptyProps(data.length, data.length, "No supplier payments yet", "Record what you pay suppliers and settle their bills, oldest first.", canCreate ? createButton("/purchasing/payments/new", "Record payment") : undefined)}
    />
  );
}

// ---- Returns --------------------------------------------------------------------------------

export function ReturnsTable({ data, hideSupplier, canCreate }: { data: ReturnRow[]; hideSupplier?: boolean; canCreate?: boolean }) {
  const columns = useMemo<Col<ReturnRow>[]>(
    () => [
      numberCol("/purchasing/returns"),
      dateCol("date"),
      ...(hideSupplier ? [] : [supplierCol<ReturnRow>()]),
      {
        accessorKey: "billNumber",
        header: "Bill",
        cell: ({ row }) =>
          row.original.billId ? (
            <Link href={`/purchasing/bills/${row.original.billId}`} className="hover:text-primary hover:underline">
              {row.original.billNumber}
            </Link>
          ) : (
            "—"
          ),
      },
      { accessorKey: "reason", header: "Reason", cell: ({ getValue }) => <span className="line-clamp-1 max-w-56">{(getValue() as string) || "—"}</span> },
      { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
      moneyCol("total", "Total"),
    ],
    [hideSupplier]
  );
  return (
    <DataTable
      columns={columns}
      data={data}
      exportName="purchase-returns"
      searchPlaceholder="Search number, supplier, bill…"
      rowHref={(r) => `/purchasing/returns/${r.id}`}
      {...emptyProps(data.length, data.length, "No purchase returns", "Send damaged or wrong goods back to the supplier against their bill. Stock goes out and the payable reduces.", canCreate ? createButton("/purchasing/returns/new", "New return") : undefined)}
    />
  );
}

// ---- Suppliers ------------------------------------------------------------------------------

const SUPPLIER_FILTERS = [
  { value: "active", label: "Active" },
  { value: "owed", label: "We owe them" },
  { value: "overdue", label: "Overdue" },
  { value: "inactive", label: "Inactive" },
];
const pickSupplier = (r: SupplierRow, f: string) =>
  f === "active" ? r.isActive : f === "inactive" ? !r.isActive : f === "owed" ? r.balance > 0 : r.overdue > 0;

export function SuppliersTable({ data, canCreate }: { data: SupplierRow[]; canCreate?: boolean }) {
  const { filter, setFilter, rows } = useFiltered(data, pickSupplier, "active");
  const columns = useMemo<Col<SupplierRow>[]>(
    () => [
      { accessorKey: "code", header: "Code", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div>
            <Link href={`/purchasing/suppliers/${row.original.id}`} className="font-medium text-primary hover:underline">
              {row.original.name}
            </Link>
            {row.original.contactPerson && <p className="text-xs text-muted-foreground">{row.original.contactPerson}</p>}
          </div>
        ),
      },
      { accessorKey: "phone", header: "Phone", cell: ({ getValue }) => (getValue() as string) || "—" },
      { accessorKey: "city", header: "City", cell: ({ getValue }) => (getValue() as string) || "—" },
      {
        accessorKey: "paymentTermsDays",
        header: "Terms",
        cell: ({ getValue }) => ((getValue() as number) ? `${getValue()} days` : "On receipt"),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        meta: { csv: (r: unknown) => ((r as SupplierRow).isActive ? "active" : "inactive") },
        cell: ({ getValue }) => <StatusBadge status={getValue() ? "active" : "inactive"} />,
      },
      moneyCol("overdue", "Overdue", { muteZero: true }),
      {
        accessorKey: "balance",
        header: "Payable",
        meta: { align: "right" },
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return <Money value={v} muteZero className={cn(v < 0 && "text-info")} />;
        },
      },
    ],
    []
  );
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="suppliers"
      searchPlaceholder="Search name, code, phone, city…"
      rowHref={(r) => `/purchasing/suppliers/${r.id}`}
      toolbar={<StatusFilter value={filter} onChange={setFilter} options={SUPPLIER_FILTERS} />}
      initialSorting={[{ id: "name", desc: false }]}
      {...emptyProps(data.length, rows.length, "No suppliers yet", "Add the mills and traders you buy from. Their payable balance and statement come straight from the ledger.", canCreate ? createButton("/purchasing/suppliers/new", "Add supplier") : undefined)}
    />
  );
}
