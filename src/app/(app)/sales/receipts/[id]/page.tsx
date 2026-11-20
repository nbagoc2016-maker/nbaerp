import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { METHOD_LABEL, PrintChrome } from "@/components/sales/common";
import { ReceiptActions } from "@/components/sales/doc-actions";
import { formatDate, formatMoney, round2 } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getReceipt } from "@/server/queries/sales";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(["sales.receipts", "sales.view"]);
  const { id } = await params;
  const data = await getReceipt(id);
  if (!data) notFound();
  const company = await getCompany();
  const { receipt: r, customer, account, allocations, allocated } = data;
  const onAccount = round2(r.amount - allocated);
  const name = customer?.name ?? "Walk-in customer";

  return (
    <>
      <PrintChrome />
      <PageHeader
        title={r.number}
        description={`${formatMoney(r.amount)} from ${name} · ${formatDate(r.date)}`}
        backHref="/sales/receipts"
        badge={<StatusBadge status={r.status} />}
        actions={<ReceiptActions id={r.id} number={r.number} status={r.status} canVoid={can(user, "sales.void")} />}
      />
      <PrintDocument showCompanyFooter
        company={company}
        title="Payment Receipt"
        number={r.number}
        date={r.date}
        meta={[
          { label: "Method", value: METHOD_LABEL[r.method] ?? r.method },
          { label: "Deposited to", value: account?.name ?? "—" },
          ...(r.reference ? [{ label: "Reference", value: r.reference }] : []),
        ]}
        party={{
          label: "Received from",
          name,
          lines: customer ? [customer.code, [customer.address, customer.city].filter(Boolean).join(", "), customer.phone] : [],
        }}
        totals={[
          ...(allocated ? [{ label: "Applied to invoices", value: allocated }] : []),
          ...(onAccount > 0 ? [{ label: "Kept as credit on account", value: onAccount }] : []),
          { label: "Amount received", value: r.amount, strong: true },
        ]}
        notes={r.notes}
        footer={
          <>
            {allocations.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoices settled</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2">Invoice</th>
                      <th className="py-2">Date</th>
                      <th className="py-2 text-right">Invoice total</th>
                      <th className="py-2 text-right">Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => (
                      <tr key={a.invoiceId} className="border-b last:border-0">
                        <td className="py-2">
                          <Link href={`/sales/invoices/${a.invoiceId}`} className="font-medium text-primary hover:underline print:text-foreground print:no-underline">
                            {a.number}
                          </Link>
                        </td>
                        <td className="py-2">{formatDate(a.date)}</td>
                        <td className="py-2 text-right tabular">{formatMoney(a.total, { fixed: true })}</td>
                        <td className="py-2 text-right font-medium tabular">{formatMoney(a.amount, { fixed: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {r.status === "void" && <p className="mt-6 text-center text-2xl font-bold uppercase tracking-[0.3em] text-destructive/70">Void</p>}
            <div className="mt-12 grid grid-cols-2 gap-8 text-xs text-muted-foreground">
              <p className="border-t pt-2">Received by</p>
              <p className="border-t pt-2 text-right">Customer signature</p>
            </div>
          </>
        }
      />
    </>
  );
}
