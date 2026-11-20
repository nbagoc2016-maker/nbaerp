import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { InfoList, PrintChrome } from "@/components/sales/common";
import { OrderActions } from "@/components/sales/doc-actions";
import { OrderInvoiceDialog } from "@/components/sales/order-invoice-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatQty } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { defaultWarehouseId, warehouseOptions } from "@/server/queries/options";
import { getOrder } from "@/server/queries/sales";
import { displayLine } from "@/server/services/sales";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("sales.view");
  const { id } = await params;
  const data = await getOrder(id);
  if (!data) notFound();
  const [company, warehouses, defaultWh] = await Promise.all([getCompany(), warehouseOptions(), defaultWarehouseId()]);
  const { order: o, lines, customer, warehouse, invoices, quotation } = data;
  const ordered = lines.reduce((s, l) => s + l.qty, 0);
  const invoiced = lines.reduce((s, l) => s + Math.min(l.qty, l.invoicedQty), 0);
  const pct = ordered ? (invoiced / ordered) * 100 : 0;

  return (
    <>
      <PrintChrome />
      <PageHeader
        title={o.number}
        description={`Sales order for ${customer.name} · ${formatDate(o.date)}`}
        backHref="/sales/orders"
        badge={<StatusBadge status={o.status} />}
        actions={
          <OrderActions
            id={o.id}
            number={o.number}
            status={o.status}
            perms={{ create: can(user, "sales.create"), void: can(user, "sales.void") }}
            invoiceDialog={<OrderInvoiceDialog orderId={o.id} lines={lines} warehouses={warehouses} defaultWarehouseId={o.warehouseId ?? defaultWh} />}
          />
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PrintDocument showCompanyFooter
          company={company}
          title="Sales Order"
          number={o.number}
          date={o.date}
          meta={[
            ...(o.deliveryDate ? [{ label: "Delivery", value: formatDate(o.deliveryDate) }] : []),
            ...(quotation ? [{ label: "Quotation", value: quotation.number }] : []),
          ]}
          party={{ label: "Customer", name: customer.name, lines: [customer.code, [customer.address, customer.city].filter(Boolean).join(", "), customer.phone] }}
          lines={lines.map((l) => {
            const d = displayLine(l);
            return { description: l.description, sku: l.sku, qty: l.qty, unit: l.unit, price: l.unitPrice, discountAmount: d.discountAmount, taxAmount: d.taxAmount, lineTotal: d.lineTotal };
          })}
          totals={[
            { label: "Subtotal", value: o.subtotal },
            ...(o.discountTotal ? [{ label: "Discount", value: -o.discountTotal }] : []),
            ...(o.taxTotal ? [{ label: "Sales tax", value: o.taxTotal }] : []),
            ...(o.shippingCharges ? [{ label: "Delivery charges", value: o.shippingCharges }] : []),
            { label: "Total", value: o.total, strong: true },
          ]}
          notes={o.notes}
        />
        <div className="no-print space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fulfilment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Invoiced</span>
                  <span className="tabular font-medium">{Math.round(pct)}%</span>
                </div>
                <Progress value={pct} />
              </div>
              <div className="space-y-2 text-sm">
                {lines.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{l.description}</span>
                    <span className="shrink-0 tabular text-muted-foreground">
                      {formatQty(Math.min(l.invoicedQty, l.qty))} / {formatQty(l.qty)} {l.unit}
                    </span>
                  </div>
                ))}
              </div>
              <InfoList
                className="sm:grid-cols-1"
                items={[
                  {
                    label: "Customer",
                    value: (
                      <Link href={`/sales/customers/${customer.id}`} className="text-primary hover:underline">
                        {customer.name}
                      </Link>
                    ),
                  },
                  { label: "Ship from", value: warehouse?.name ?? "Default warehouse" },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">{o.status === "draft" ? "Confirm the order to start invoicing it." : "Not invoiced yet."}</p>
              ) : (
                invoices.map((i) => (
                  <Link key={i.id} href={`/sales/invoices/${i.id}`} className="flex items-center justify-between rounded-lg border p-2.5 text-sm hover:bg-muted/40">
                    <div>
                      <p className="font-medium">{i.number}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        {formatDate(i.date)} <StatusBadge status={i.status} />
                      </p>
                    </div>
                    <Money value={i.total} className="font-medium" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
