import Link from "next/link";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, Coins, Landmark, Plus, Smartphone } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Amount, fmtAmount } from "@/components/accounting/amount";
import { TransfersTable } from "@/components/accounting/transfers-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, monthLabel, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import { can, requirePermission } from "@/server/auth";
import { listFunds, listRegisters, listTransfers } from "@/server/queries/accounting";

const ICONS = { bank: Landmark, cash: Banknote, wallet: Smartphone } as const;

export default async function BankingPage() {
  const user = await requirePermission("accounting.view");
  const canBank = can(user, "accounting.banking");
  const [registers, transfers, funds] = await Promise.all([listRegisters(), listTransfers(), listFunds()]);
  const active = registers.filter((r) => r.isActive);
  const total = (k: string[]) => active.filter((r) => k.includes(r.kind)).reduce((s, r) => s + r.balance, 0);
  const pettyTotal = funds.filter((f) => f.isActive).reduce((s, f) => s + f.balance, 0);

  return (
    <>
      <PageHeader
        title="Cash & Bank"
        description="Balances and cash books for every till, bank account and wallet."
        actions={
          canBank ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/accounting/banking/new">
                  <Plus className="size-4" />
                  Add bank account
                </Link>
              </Button>
              <Button asChild>
                <Link href="/accounting/banking/transfers/new">
                  <ArrowLeftRight className="size-4" />
                  Transfer money
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total cash & bank" value={fmtAmount(total(["cash", "bank", "wallet"]) + pettyTotal)} icon={Landmark} hint="incl. petty cash" />
        <StatCard label="In banks & wallets" value={fmtAmount(total(["bank", "wallet"]))} />
        <StatCard label="Cash in hand" value={fmtAmount(total(["cash"]))} icon={Banknote} />
        <StatCard label="Petty cash" value={fmtAmount(pettyTotal)} icon={Coins} hint={<Link href="/accounting/petty-cash" className="hover:underline">View funds</Link>} />
      </div>

      {registers.length === 0 ? (
        <EmptyState icon={Landmark} title="No cash or bank accounts yet" description="Add your bank accounts, tills and wallets to track balances and cash books." />
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {registers.map((r) => {
            const Icon = ICONS[r.kind];
            return (
              <Link key={r.id} href={`/accounting/banking/${r.id}`} className="group">
                <Card className={cn("h-full gap-0 py-0 transition-colors group-hover:border-primary/50", !r.isActive && "opacity-60")}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.code}
                          {r.bankName ? ` · ${r.bankName}` : ""}
                          {r.accountNumber ? ` · ${r.accountNumber}` : ""}
                          {!r.isActive ? " · Inactive" : ""}
                        </p>
                      </div>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                    </div>
                    <p className="text-2xl font-semibold tracking-tight">
                      <Amount value={r.balance} />
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <ArrowDownLeft className="size-3.5 text-success" />
                        In {formatMoney(r.monthIn)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ArrowUpRight className="size-3.5 text-destructive" />
                        Out {formatMoney(r.monthOut)}
                      </span>
                      <span>{monthLabel(today().slice(0, 7))}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Transfers</h2>
        <Button variant="link" asChild className="px-0">
          <Link href="/accounting/banking/transfers">View all</Link>
        </Button>
      </div>
      <TransfersTable data={transfers.slice(0, 50)} canTransfer={canBank} pageSize={10} />
    </>
  );
}
