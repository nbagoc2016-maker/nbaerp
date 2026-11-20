import { PageHeader } from "@/components/app/page-header";
import { TransferForm } from "@/components/accounting/transfer-form";
import { today } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { moneyAccountOptions } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";

export default async function NewTransferPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requirePermission("accounting.banking");
  const sp = await searchParams;
  const [accounts, company] = await Promise.all([moneyAccountOptions({ includePettyCash: true }), getCompany()]);
  const valid = (v?: string) => (v && accounts.some((a) => a.value === v) ? v : null);
  return (
    <>
      <PageHeader title="Transfer money" description="Deposit, withdraw or move money between your accounts." backHref="/accounting/banking" />
      <TransferForm accounts={accounts} defaultDate={today()} defaultFrom={valid(sp.from)} defaultTo={valid(sp.to)} lockDate={company.lockDate ?? null} />
    </>
  );
}
