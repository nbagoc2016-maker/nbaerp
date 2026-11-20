import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { VoucherForm } from "@/components/accounting/voucher-form";
import { Button } from "@/components/ui/button";
import { today } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { listFunds, moneyAccountOptions } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { accountOptions } from "@/server/queries/options";

export default async function NewVoucherPage({ searchParams }: { searchParams: Promise<{ fund?: string; type?: string; amount?: string }> }) {
  await requirePermission("accounting.pettycash");
  const sp = await searchParams;
  const [funds, expenseAccounts, sources, company] = await Promise.all([listFunds(), accountOptions(["expense"]), moneyAccountOptions(), getCompany()]);
  const active = funds.filter((f) => f.isActive);
  const fundId = active.some((f) => f.id === sp.fund) ? sp.fund : null;
  const amount = Number(sp.amount);

  return (
    <>
      <PageHeader title="New petty cash voucher" description="Record money paid out of, or put into, a petty cash fund." backHref="/accounting/petty-cash" />
      {active.length === 0 ? (
        <EmptyState
          title="Create a petty cash fund first"
          description="Vouchers are recorded against a fund."
          action={
            <Button asChild size="sm">
              <Link href="/accounting/petty-cash">Go to Petty Cash</Link>
            </Button>
          }
        />
      ) : (
        <VoucherForm
          funds={active.map((f) => ({ id: f.id, name: f.name, balance: f.balance, floatAmount: f.floatAmount, custodianName: f.custodianName }))}
          expenseAccounts={expenseAccounts}
          sourceAccounts={sources}
          defaultDate={today()}
          defaults={{ fundId, type: sp.type === "topup" ? "topup" : "expense", amount: Number.isFinite(amount) && amount > 0 ? amount : null }}
          lockDate={company.lockDate ?? null}
        />
      )}
    </>
  );
}
