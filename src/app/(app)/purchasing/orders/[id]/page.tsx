import { notFound } from "next/navigation";
import { formatDate, formatQty } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { OrderActions } from "@/components/purchasing/doc-actions";
import { printLine, printTotals } from "@/components/purchasing/doc-lines";
import { DocFlow, RelatedDocs } from "@/components/purchasing/related-docs";
import { Signatures } from "@/components/purchasing/signatures";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getPurchaseOrder } from "@/server/queries/purchasing";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("purchasing.view");
  const { id } = await params;
  const [data, company] = await Promise.all([getPurchaseOrder(id), getCompany()]);
  if (!data) notFound();
  const { po, supplier, warehouse, lines } = data;

  const stockLines = lines.filter((l) => l.isStock);
  const hasToReceive = stockLines.some((l) => l.qty - l.receivedQty > 0.0005);
  const hasToBill = lines.some((l) => l.qty - l.billedQty > 0.0005);
  const flowStep = po.status === "draft" || po.status === "approved" || po.status === "sent" ? 0 : data.bills.length ? 2 : 1;

  return (
    <>
      <PageHeader
        title={po.number}
        description={`Purchase order to ${supplier.name}`}
        backHref="/purchasing/orders"
        badge={<StatusBadge status={po.status} />}
        actions={
          <>
            <PrintButton />
            <OrderActions
              id={po.id}
              number={po.number}
              status={po.status}
              hasToReceive={hasToReceive}
              hasToBill={hasToBill}
              perms={{ create: can(user, "purchasing.create"), approve: can(user, "purchasing.approve") }}
            />
          </>
        }
      />
      <div className="mb-4">
        <DocFlow current={flowStep} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PrintDocument
          company={company}
          title="Purchase Order"
          number={po.number}
          date={po.date}
          meta={[
            ...(po.expectedDate ? [{ label: "Expected", value: formatDate(po.expectedDate) }] : []),
            { label: "Deliver to", value: warehouse.name },
            ...(data.approvedByName ? [{ label: "Approved by", value: data.approvedByName }] : []),
          ]}
          party={{
            label: "Supplier",
            name: supplier.name,
            lines: [
              supplier.contactPerson,
              [supplier.address, supplier.city].filter(Boolean).join(", "),
              supplier.phone,
              supplier.taxNumber ? `NTN: ${supplier.taxNumber}` : null,
            ],
          }}
          lines={lines.map(printLine)}
          totals={printTotals(po)}
          notes={po.notes}
          footer={<Signatures terms={po.terms} labels={["Prepared by", "Approved by", "Supplier acceptance"]} />}
        />

        <div className="no-print space-y-6">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4">
              <CardTitle className="text-sm">Delivery progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-5 py-4">
              {stockLines.length === 0 && <p className="text-sm text-muted-foreground">No stock items on this order.</p>}
              {stockLines.map((l) => {
                const pct = l.qty ? Math.min(Math.round((l.receivedQty / l.qty) * 100), 100) : 0;
                return (
                  <div key={l.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{l.description}</span>
                      <span className="shrink-0 text-xs tabular text-muted-foreground">
                        {formatQty(l.receivedQty)} / {formatQty(l.qty)} {l.unit}
                      </span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <p className="text-xs text-muted-foreground">
                      Billed {formatQty(l.billedQty)} {l.unit}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <RelatedDocs
            groups={[
              {
                label: "Goods receipts",
                docs: data.receipts.map((r) => ({ href: `/purchasing/receipts/${r.id}`, number: r.number, date: r.date, status: r.status === "posted" ? r.billStatus : r.status, amount: r.total })),
                empty: "Nothing received yet",
              },
              {
                label: "Supplier bills",
                docs: data.bills.map((b) => ({ href: `/purchasing/bills/${b.id}`, number: b.number, date: b.date, status: b.status === "posted" ? b.paymentStatus : b.status, amount: b.total })),
                empty: "Not billed yet",
              },
            ]}
          />
        </div>
      </div>
    </>
  );
}
