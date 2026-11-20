import { PageHeader } from "@/components/app/page-header";
import { PaymentForm } from "@/components/purchasing/payment-form";
import { requirePermission } from "@/server/auth";
import { cashBankOptions, supplierOptions } from "@/server/queries/options";
import { openBills } from "@/server/queries/purchasing";
import { supplierBalances } from "@/server/queries/suppliers";

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ supplier?: string; bill?: string }> }) {
  await requirePermission("purchasing.payments");
  const sp = await searchParams;
  const [suppliers, accounts, bills, balances] = await Promise.all([supplierOptions(), cashBankOptions(), openBills(), supplierBalances()]);
  const supplierId = suppliers.some((s) => s.value === sp.supplier) ? sp.supplier! : null;

  return (
    <>
      <PageHeader title="Record supplier payment" description="Pay a supplier and settle their open bills." backHref={sp.bill ? `/purchasing/bills/${sp.bill}` : "/purchasing/payments"} />
      <PaymentForm
        suppliers={suppliers}
        accounts={accounts}
        bills={bills}
        balances={Object.fromEntries(balances)}
        initialSupplierId={supplierId}
        focusBillId={sp.bill ?? null}
      />
    </>
  );
}
