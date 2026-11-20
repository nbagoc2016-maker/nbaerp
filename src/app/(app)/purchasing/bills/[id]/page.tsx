import { notFound } from "next/navigation";
import { formatDate, formatQty, round2, today } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { BillActions } from "@/components/purchasing/doc-actions";
import { printLine, printTotals } from "@/components/purchasing/doc-lines";
import { DocFlow, RelatedDocs, SummaryList } from "@/components/purchasing/related-docs";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getBill } from "@/server/queries/purchasing";

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("purchasing.view");
  const { id } = await params;
  const [data, company] = await Promise.all([getBill(id), getCompany()]);
  if (!data) notFound();
  const { bill, supplier, lines } = data;

  const outstanding = bill.status === "posted" ? round2(bill.total - bill.amountPaid) : 0;
  const overdue = bill.status === "posted" && bill.paymentStatus !== "paid" && !!bill.dueDate && bill.dueDate < today();
  const paid = round2(data.allocations.filter((a) => a.status === "posted").reduce((t, a) => t + a.amount, 0));
  const returned = round2(data.returns.filter((r) => r.status === "posted").reduce((t, r) => t + r.total, 0));
  const canVoid = !data.allocations.some((a) => a.status === "posted" && a.amount > 0) && !data.returns.some((r) => r.status === "posted");
  const badge = bill.status === "posted" ? (overdue ? "overdue" : bill.paymentStatus) : bill.status;

  return (
    <>
      <PageHeader
        title={bill.number}
        description={`Bill from ${supplier.name}${bill.supplierInvoiceNo ? ` · their invoice ${bill.supplierInvoiceNo}` : ""}`}
        backHref="/purchasing/bills"
        badge={
          <span className="flex gap-1">
            {bill.status !== "posted" && <StatusBadge status={bill.status} />}
            {bill.status === "posted" && <StatusBadge status={badge} />}
          </span>
        }
        actions={
          <>
            <PrintButton />
            <BillActions
              id={bill.id}
              number={bill.number}
              status={bill.status}
              paymentStatus={bill.paymentStatus}
              supplierId={bill.supplierId}
              canVoid={canVoid}
              perms={{
                create: can(user, "purchasing.create"),
                post: can(user, "purchasing.post"),
                void: can(user, "purchasing.void"),
                payments: can(user, "purchasing.payments"),
              }}
            />
          </>
        }
      />
      <div className="mb-4">
        <DocFlow current={bill.paymentStatus === "paid" && bill.status === "posted" ? 3 : 2} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PrintDocument
          company={company}
          title="Supplier Bill"
          number={bill.number}
          date={bill.date}
          meta={[
            ...(bill.supplierInvoiceNo ? [{ label: "Supplier invoice", value: bill.supplierInvoiceNo }] : []),
            ...(bill.dueDate ? [{ label: "Due", value: formatDate(bill.dueDate) }] : []),
            ...(data.poNumber ? [{ label: "Purchase order", value: data.poNumber }] : []),
            ...(data.receipts.length ? [{ label: "Goods receipt", value: data.receipts.map((r) => r.number).join(", ") }] : []),
            ...(bill.receivesStock && data.warehouseName ? [{ label: "Received into", value: data.warehouseName }] : []),
          ]}
          party={{
            label: "Supplier",
            name: supplier.name,
            lines: [[supplier.address, supplier.city].filter(Boolean).join(", "), supplier.phone, supplier.taxNumber ? `NTN: ${supplier.taxNumber}` : null],
          }}
          lines={lines.map((l) =>
            printLine({
              ...l,
              description: [l.description, l.batchNo ? `roll ${l.batchNo}` : null, l.accountName && !l.productId ? l.accountName : null].filter(Boolean).join(" — "),
            })
          )}
          totals={printTotals(bill, bill.status === "posted" ? [
            ...(paid ? [{ label: "Paid", value: -paid }] : []),
            ...(returned ? [{ label: "Returned", value: -returned }] : []),
            { label: "Balance due", value: outstanding, strong: true },
          ] : [])}
          notes={bill.notes}
        />

        <div className="no-print space-y-6">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4">
              <CardTitle className="text-sm">Payment</CardTitle>
            </CardHeader>
            <CardContent className="px-5 py-4">
              <SummaryList
                items={[
                  { label: "Bill total", value: <Money value={bill.total} /> },
                  { label: "Paid", value: <Money value={paid} /> },
                  { label: "Returned", value: <Money value={returned} muteZero /> },
                  { label: "Due date", value: <span className={overdue ? "font-medium text-destructive" : undefined}>{formatDate(bill.dueDate) || "—"}</span> },
                  { label: "Balance due", value: <Money value={outstanding} />, strong: true },
                ]}
              />
              {lines.some((l) => l.returnedQty > 0) && (
                <div className="mt-4 space-y-1 border-t pt-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Returned items</p>
                  {lines
                    .filter((l) => l.returnedQty > 0)
                    .map((l) => (
                      <div key={l.id} className="flex justify-between gap-2">
                        <span className="truncate">{l.description}</span>
                        <span className="tabular text-muted-foreground">
                          {formatQty(l.returnedQty)} / {formatQty(l.qty)} {l.unit}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
          <RelatedDocs
            groups={[
              {
                label: "Purchase order",
                docs: bill.purchaseOrderId && data.poNumber ? [{ href: `/purchasing/orders/${bill.purchaseOrderId}`, number: data.poNumber }] : [],
                empty: "No purchase order",
              },
              { label: "Goods receipts", docs: data.receipts.map((r) => ({ href: `/purchasing/receipts/${r.id}`, number: r.number })), empty: bill.receivesStock ? "Goods received with this bill" : "No goods receipt" },
              {
                label: "Payments",
                docs: data.allocations.map((a) => ({ href: `/purchasing/payments/${a.id}`, number: a.number, date: a.date, status: a.status === "void" ? "void" : undefined, amount: a.amount })),
                empty: "No payments yet",
              },
              { label: "Returns", docs: data.returns.map((r) => ({ href: `/purchasing/returns/${r.id}`, number: r.number, date: r.date, status: r.status, amount: r.total })), empty: "No returns" },
            ]}
          />
        </div>
      </div>
    </>
  );
}
