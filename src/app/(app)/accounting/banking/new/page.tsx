import { PageHeader } from "@/components/app/page-header";
import { BankAccountForm } from "@/components/accounting/bank-account-form";
import { today } from "@/lib/format";
import { requirePermission } from "@/server/auth";

export default async function NewBankAccountPage() {
  await requirePermission("accounting.banking");
  return (
    <>
      <PageHeader title="Add bank account" description="Creates the ledger account and its cash book in one step." backHref="/accounting/banking" />
      <BankAccountForm defaultDate={today()} />
    </>
  );
}
