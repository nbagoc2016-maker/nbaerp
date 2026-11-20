import { PageHeader } from "@/components/app/page-header";
import { ReceiptForm } from "@/components/sales/receipt-form";
import { today } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { customerOptions } from "@/server/queries/options";
import { allOpenInvoices, customerBalances, paymentAccounts } from "@/server/queries/sales";
import { WALK_IN } from "@/server/services/sales-schemas";

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ customer?: string; invoice?: string }> }) {
  await requirePermission("sales.receipts");
  const sp = await searchParams;
  const [customers, invoices, accounts, balances] = await Promise.all([customerOptions(), allOpenInvoices(), paymentAccounts(), customerBalances()]);
  const fromInvoice = invoices.find((i) => i.id === sp.invoice);
  const initialCustomer = fromInvoice
    ? (fromInvoice.customerId ?? WALK_IN)
    : sp.customer === "walkin"
      ? WALK_IN
      : customers.some((c) => c.value === sp.customer)
        ? sp.customer!
        : null;
  return (
    <>
      <PageHeader title="Record receipt" description="Money in from a customer. It's applied to their oldest invoices first." backHref="/sales/receipts" />
      <ReceiptForm
        customers={customers}
        balances={balances}
        invoices={invoices}
        accounts={accounts}
        initialCustomer={initialCustomer}
        initialInvoiceId={fromInvoice?.id ?? null}
        today={today()}
      />
    </>
  );
}
