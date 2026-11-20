import { notFound } from "next/navigation";
import { formatQty, round2 } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { ReceiptActions } from "@/components/purchasing/doc-actions";
import { DocFlow, RelatedDocs, SummaryList } from "@/components/purchasing/related-docs";
import { Signatures } from "@/components/purchasing/signatures";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getReceipt } from "@/server/queries/purchasing";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("purchasing.view");
  const { id } = await params;
  const [data, company] = await Promise.all([getReceipt(id), getCompany()]);
  if (!data) notFound();
  const { grn, supplier, warehouse, lines } = data;
  const rolls = lines.filter((l) => l.batchNo !== null);
  const unbilled = round2(lines.reduce((t, l) => t + Math.max(l.qty - l.billedQty, 0) * l.unitCost, 0));

  return (
    <>
      <PageHeader
        title={grn.number}
        description={`Goods received from ${supplier.name} into ${warehouse.name}`}
        backHref="/purchasing/receipts"
        badge={
          <span className="flex gap-1">
            <StatusBadge status={grn.status} />
            {grn.status === "posted" && <StatusBadge status={grn.billStatus} />}
          </span>
        }
        actions={
          <>
            <PrintButton />
            <ReceiptActions
              id={grn.id}
              number={grn.number}
              status={grn.status}
              billStatus={grn.billStatus}
              perms={{ create: can(user, "purchasing.create"), post: can(user, "purchasing.post"), void: can(user, "purchasing.void") }}
            />
          </>
        }
      />
      <div className="mb-4">
        <DocFlow current={1} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PrintDocument
          company={company}
          title="Goods Received Note"
          number={grn.number}
          date={grn.date}
          meta={[
            { label: "Warehouse", value: warehouse.name },
            ...(data.poNumber ? [{ label: "Purchase order", value: data.poNumber }] : []),
            ...(grn.supplierDeliveryRef ? [{ label: "Delivery ref", value: grn.supplierDeliveryRef }] : []),
          ]}
          party={{ label: "Received from", name: supplier.name, lines: [[supplier.address, supplier.city].filter(Boolean).join(", "), supplier.phone] }}
          lines={lines.map((l) => ({
            description: l.batchNo ? `${l.description} — roll ${l.batchNo || "(numbered on posting)"}` : l.description,
            sku: l.sku,
            unit: l.unit,
            qty: l.qty,
            price: l.unitCost,
            lineTotal: round2(l.qty * l.unitCost),
          }))}
          totals={[{ label: "Receipt value", value: grn.totalValue, strong: true }]}
          notes={grn.notes}
          footer={<Signatures labels={["Received by", "Checked by", "Delivered by"]} />}
        />

        <div className="no-print space-y-6">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4">
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-5 py-4">
              <SummaryList
                items={[
                  { label: "Lines", value: lines.length },
                  { label: "Rolls / lots", value: rolls.length || "—" },
                  { label: "Billed value", value: <Money value={round2(grn.totalValue - unbilled)} /> },
                  { label: "Still to bill", value: <Money value={grn.status === "posted" ? unbilled : 0} />, strong: true },
                ]}
              />
              {rolls.length > 0 && (
                <div className="mt-4 space-y-1.5 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rolls</p>
                  {rolls.map((r) => (
                    <div key={r.id} className="flex justify-between text-sm">
                      <span className="truncate">
                        <span className="font-mono text-xs">{r.batchNo || "auto"}</span> <span className="text-muted-foreground">{r.productName}</span>
                      </span>
                      <span className="tabular">
                        {formatQty(r.qty)} {r.unit}
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
                docs: grn.purchaseOrderId && data.poNumber ? [{ href: `/purchasing/orders/${grn.purchaseOrderId}`, number: data.poNumber }] : [],
                empty: "Received without a purchase order",
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
