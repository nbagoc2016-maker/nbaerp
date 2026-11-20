import { notFound } from "next/navigation";
import { formatDate, formatMoney, round2 } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { PaymentActions } from "@/components/purchasing/doc-actions";
import { DocFlow, RelatedDocs, SummaryList } from "@/components/purchasing/related-docs";
import { Signatures } from "@/components/purchasing/signatures";
import { paymentMethodLabel } from "@/components/purchasing/doc-lines";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getPayment } from "@/server/queries/purchasing";

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(["purchasing.payments", "purchasing.view"]);
  const { id } = await params;
  const [data, company] = await Promise.all([getPayment(id), getCompany()]);
  if (!data) notFound();
  const { payment, supplier, allocations } = data;
  const allocated = round2(allocations.reduce((t, a) => t + a.amount, 0));
  const advance = round2(payment.amount - allocated);

  return (
    <>
      <PageHeader
        title={payment.number}
        description={`Payment to ${supplier.name}`}
        backHref="/purchasing/payments"
        badge={<StatusBadge status={payment.status} />}
        actions={
          <>
            <PrintButton label="Print voucher" />
            <PaymentActions id={payment.id} number={payment.number} status={payment.status} canVoid={can(user, "purchasing.void")} />
          </>
        }
      />
      <div className="mb-4">
        <DocFlow current={3} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PrintDocument
          company={company}
          title="Payment Voucher"
          number={payment.number}
          date={payment.date}
          meta={[
            { label: "Method", value: paymentMethodLabel(payment.method) },
            { label: "Paid from", value: data.accountName ?? "—" },
            ...(payment.reference ? [{ label: payment.method === "cheque" ? "Cheque no" : "Reference", value: payment.reference }] : []),
          ]}
          party={{ label: "Paid to", name: supplier.name, lines: [[supplier.address, supplier.city].filter(Boolean).join(", "), supplier.phone] }}
          totals={[
            ...(allocations.length ? [{ label: "Applied to bills", value: allocated }] : []),
            ...(advance > 0 ? [{ label: "Advance", value: advance }] : []),
            { label: "Amount paid", value: payment.amount, strong: true },
          ]}
          notes={payment.notes}
          footer={
            <>
              {allocations.length > 0 && (
                <table className="mt-6 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-2">Bill</th>
                      <th className="py-2 pr-2">Supplier invoice</th>
                      <th className="py-2 pr-2">Bill date</th>
                      <th className="py-2 pr-2 text-right">Bill total</th>
                      <th className="py-2 text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => (
                      <tr key={a.billId} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-medium">{a.number}</td>
                        <td className="py-2 pr-2">{a.supplierInvoiceNo ?? "—"}</td>
                        <td className="py-2 pr-2">{formatDate(a.date)}</td>
                        <td className="py-2 pr-2 text-right tabular">{formatMoney(a.total, { fixed: true })}</td>
                        <td className="py-2 text-right tabular">{formatMoney(a.amount, { fixed: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {payment.status === "void" && <p className="mt-6 text-center text-lg font-semibold uppercase tracking-widest text-destructive">Void</p>}
              <Signatures labels={["Prepared by", "Approved by", "Received by"]} />
            </>
          }
        />

        <div className="no-print space-y-6">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4">
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-5 py-4">
              <SummaryList
                items={[
                  { label: "Amount", value: <Money value={payment.amount} /> },
                  { label: "Applied to bills", value: <Money value={allocated} /> },
                  { label: "Advance with supplier", value: <Money value={advance} muteZero />, strong: true },
                ]}
              />
              <p className="mt-3 text-xs text-muted-foreground">Dr Accounts Payable ({supplier.name}) · Cr {data.accountCode} {data.accountName}</p>
            </CardContent>
          </Card>
          <RelatedDocs
            groups={[
              { label: "Supplier", docs: [{ href: `/purchasing/suppliers/${supplier.id}`, number: supplier.name }] },
              {
                label: "Bills settled",
                docs: allocations.map((a) => ({ href: `/purchasing/bills/${a.billId}`, number: a.number, date: a.date, amount: a.amount })),
                empty: "Not applied to any bill (advance)",
              },
            ]}
          />
        </div>
      </div>
    </>
  );
}
