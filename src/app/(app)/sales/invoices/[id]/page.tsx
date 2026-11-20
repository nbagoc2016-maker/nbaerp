import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { InfoList, METHOD_LABEL, PrintChrome } from "@/components/sales/common";
import { InvoiceActions } from "@/components/sales/doc-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney, round2, today } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getInvoice } from "@/server/queries/sales";
import { displayLine } from "@/server/services/sales";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("sales.view");
  const { id } = await params;
  const data = await getInvoice(id);
  if (!data) notFound();
  const company = await getCompany();
  const { invoice: inv, lines, customer, warehouse, payments, returns, order, journal } = data;
  const balance = inv.status === "posted" ? round2(inv.total - inv.amountPaid) : 0;
  const overdue = inv.status === "posted" && inv.paymentStatus !== "paid" && !!inv.dueDate && inv.dueDate < today();
  const showCost = can(user, "inventory.cost");
  const credits = returns.filter((r) => r.status === "posted" && r.settlement === "credit").reduce((s, r) => s + r.total, 0);
  const received = payments.filter((p) => p.status === "posted").reduce((s, p) => s + p.amount, 0);

  const totals = [
    { label: "Subtotal", value: inv.subtotal },
    ...(inv.discountTotal ? [{ label: "Discount", value: -inv.discountTotal }] : []),
    ...(inv.taxTotal ? [{ label: "Sales tax", value: inv.taxTotal }] : []),
    ...(inv.shippingCharges ? [{ label: "Delivery charges", value: inv.shippingCharges }] : []),
    ...(inv.roundOff ? [{ label: "Round off", value: inv.roundOff }] : []),
    { label: "Total", value: inv.total, strong: true },
    ...(inv.status === "posted" && inv.amountPaid ? [{ label: "Paid / credited", value: -inv.amountPaid }] : []),
    ...(balance > 0 ? [{ label: "Balance due", value: balance, strong: true }] : []),
  ];

  return (
    <>
      <PrintChrome />
      <PageHeader
        title={inv.number}
        description={`${inv.channel === "pos" ? "POS sale" : "Invoice"} to ${inv.customerName} · ${formatDate(inv.date)}`}
        backHref="/sales/invoices"
        badge={
          <div className="flex gap-1.5">
            <StatusBadge status={inv.status} />
            {inv.status === "posted" && <StatusBadge status={overdue ? "overdue" : inv.paymentStatus} />}
          </div>
        }
        actions={
          <InvoiceActions
            id={inv.id}
            number={inv.number}
            status={inv.status}
            channel={inv.channel}
            customerId={inv.customerId}
            balance={balance}
            returnable={data.returnable}
            perms={{ create: can(user, "sales.create"), post: can(user, "sales.post"), void: can(user, "sales.void"), receipts: can(user, "sales.receipts") }}
          />
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PrintDocument showCompanyFooter
          company={company}
          title={inv.taxTotal > 0 ? "Sales Tax Invoice" : inv.channel === "pos" ? "Sale Receipt" : "Invoice"}
          number={inv.number}
          date={inv.date}
          meta={[
            ...(inv.dueDate && inv.dueDate !== inv.date ? [{ label: "Due", value: formatDate(inv.dueDate) }] : []),
            ...(order ? [{ label: "Order", value: order.number }] : []),
            ...(inv.salesperson ? [{ label: "Salesperson", value: inv.salesperson }] : []),
          ]}
          party={{
            label: "Bill to",
            name: inv.customerName,
            lines: customer
              ? [customer.code, [customer.address, customer.city].filter(Boolean).join(", "), customer.phone, customer.taxNumber ? `NTN ${customer.taxNumber}` : null]
              : [inv.customerPhone],
          }}
          lines={lines.map((l) => {
            const d = displayLine(l);
            return { description: l.description, sku: l.sku, qty: l.qty, unit: l.unit, price: l.unitPrice, discountAmount: d.discountAmount, taxAmount: d.taxAmount, lineTotal: d.lineTotal };
          })}
          totals={totals}
          notes={inv.notes}
          footer={
            inv.status === "void" ? (
              <p className="mt-6 text-center text-2xl font-bold uppercase tracking-[0.3em] text-destructive/70">Void</p>
            ) : inv.status === "draft" ? (
              <p className="mt-6 text-center text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">Draft — not posted</p>
            ) : null
          }
        />

        <div className="no-print space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <InfoList
                className="sm:grid-cols-2 xl:grid-cols-1"
                items={[
                  {
                    label: "Customer",
                    value: customer ? (
                      <Link href={`/sales/customers/${customer.id}`} className="text-primary hover:underline">
                        {customer.name}
                      </Link>
                    ) : (
                      `${inv.customerName} (walk-in)`
                    ),
                  },
                  { label: "Warehouse", value: warehouse?.name },
                  { label: "Received", value: <Money value={received} /> },
                  ...(credits ? [{ label: "Credited by returns", value: <Money value={credits} /> }] : []),
                  { label: "Balance due", value: <Money value={balance} className={balance > 0 ? "text-destructive" : "text-success"} /> },
                  ...(showCost && inv.status === "posted"
                    ? [
                        { label: "Cost of goods", value: <Money value={inv.costTotal} /> },
                        {
                          label: "Gross profit",
                          value: (() => {
                            const net = inv.total - inv.taxTotal - inv.shippingCharges;
                            const gp = round2(net - inv.costTotal);
                            return (
                              <span>
                                <Money value={gp} signed /> <span className="text-xs text-muted-foreground">({net > 0 ? ((gp / net) * 100).toFixed(1) : "0"}%)</span>
                              </span>
                            );
                          })(),
                        },
                      ]
                    : []),
                  ...(journal ? [{ label: "Journal entry", value: `${journal.number}${journal.status === "void" ? " (void)" : ""}` }] : []),
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                payments.map((p) => (
                  <Link key={`${p.id}`} href={`/sales/receipts/${p.id}`} className="flex items-center justify-between rounded-lg border p-2.5 text-sm hover:bg-muted/40">
                    <div>
                      <p className="font-medium">
                        {p.number} {p.status === "void" && <StatusBadge status="void" className="ml-1" />}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.date)} · {METHOD_LABEL[p.method]} · {p.account}
                      </p>
                    </div>
                    <Money value={p.amount} className="font-medium" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {returns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Returns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {returns.map((r) => (
                  <Link key={r.id} href={`/sales/returns/${r.id}`} className="flex items-center justify-between rounded-lg border p-2.5 text-sm hover:bg-muted/40">
                    <div>
                      <p className="font-medium">{r.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(r.date)} · {r.settlement === "refund" ? "Refund" : "Credit"} · <StatusBadge status={r.status} />
                      </p>
                    </div>
                    <span className="tabular font-medium">{formatMoney(r.total)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
