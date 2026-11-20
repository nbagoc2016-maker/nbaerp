import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { InvoicePicker, ReturnForm } from "@/components/sales/return-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney, round2, today } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getInvoice, paymentAccounts, returnableInvoices } from "@/server/queries/sales";

export default async function NewReturnPage({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const user = await requirePermission("sales.create");
  const sp = await searchParams;

  if (!sp.invoice) {
    const invoices = await returnableInvoices();
    return (
      <>
        <PageHeader title="New sales return" description="Start from the invoice the goods were sold on." backHref="/sales/returns" />
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Which invoice?</CardTitle>
            <CardDescription>Only posted invoices with items left to return are listed.</CardDescription>
          </CardHeader>
          <CardContent>
            <InvoicePicker
              invoices={invoices.map((i) => ({ value: i.id, label: `${i.number} · ${i.customerName}`, hint: `${formatDate(i.date)} · ${formatMoney(i.total)}` }))}
            />
          </CardContent>
        </Card>
      </>
    );
  }

  const data = await getInvoice(sp.invoice);
  if (!data) notFound();
  const inv = data.invoice;
  const accounts = await paymentAccounts();
  return (
    <>
      <PageHeader title="New sales return" description={`Goods coming back from ${inv.number}`} backHref={`/sales/invoices/${inv.id}`} />
      {inv.status !== "posted" ? (
        <Card className="max-w-2xl">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Only posted invoices can have returns. This one is {inv.status}.</CardContent>
        </Card>
      ) : (
        <ReturnForm
          invoice={{
            id: inv.id,
            number: inv.number,
            date: inv.date,
            customerName: inv.customerName,
            walkIn: !inv.customerId,
            paymentStatus: inv.paymentStatus,
            outstanding: round2(inv.total - inv.amountPaid),
          }}
          lines={data.lines.map((l) => ({
            id: l.id,
            description: l.description,
            sku: l.sku,
            unit: l.unit,
            allowFraction: l.allowFraction,
            qty: l.qty,
            returnedQty: l.returnedQty,
            unitPrice: l.unitPrice,
            taxAmount: l.taxAmount,
            lineTotal: l.lineTotal,
          }))}
          accounts={accounts}
          today={today()}
          canPost={can(user, "sales.post")}
        />
      )}
    </>
  );
}
