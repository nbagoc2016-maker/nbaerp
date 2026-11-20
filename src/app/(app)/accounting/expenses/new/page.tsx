import { PageHeader } from "@/components/app/page-header";
import { ExpenseForm } from "@/components/accounting/expense-form";
import { today } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { moneyAccountOptions } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { accountOptions, supplierOptions } from "@/server/queries/options";

export default async function NewExpensePage() {
  await requirePermission("accounting.expenses");
  const [expenseAccounts, paidFrom, suppliers, company] = await Promise.all([
    accountOptions(["expense"]),
    moneyAccountOptions({ includePettyCash: true }),
    supplierOptions(),
    getCompany(),
  ]);
  return (
    <>
      <PageHeader title="Record expense" description="Posts the expense to its category and takes the money out of the account you paid from." backHref="/accounting/expenses" />
      <ExpenseForm
        expenseAccounts={expenseAccounts}
        paidFromAccounts={paidFrom}
        suppliers={suppliers.map(({ value, label, hint, keywords }) => ({ value, label, hint, keywords }))}
        defaultDate={today()}
        lockDate={company.lockDate ?? null}
      />
    </>
  );
}
