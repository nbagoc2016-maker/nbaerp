import Link from "next/link";
import { Coins, FileText, Plus, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { Amount } from "@/components/accounting/amount";
import { FundDialog } from "@/components/accounting/fund-dialog";
import { UrlSelect } from "@/components/accounting/url-filters";
import { VouchersTable } from "@/components/accounting/vouchers-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@/lib/format";
import { readPeriod } from "@/lib/period";
import { cn } from "@/lib/utils";
import { can, requirePermission } from "@/server/auth";
import { listFunds, listVouchers } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";

export default async function PettyCashPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; fund?: string; type?: string; status?: string }> }) {
  const user = await requirePermission(["accounting.pettycash", "accounting.view"]);
  const sp = await searchParams;
  const period = readPeriod(sp);
  const [funds, vouchers, company] = await Promise.all([
    listFunds(),
    listVouchers({ ...period, fundId: sp.fund, type: sp.type, status: sp.status }),
    getCompany(),
  ]);
  const canPetty = can(user, "accounting.pettycash");

  return (
    <>
      <PageHeader
        title="Petty Cash"
        description="Imprest funds for small cash spends, with vouchers and top-ups."
        actions={
          canPetty ? (
            <>
              <FundDialog />
              <Button asChild>
                <Link href="/accounting/petty-cash/new">
                  <Plus className="size-4" />
                  New voucher
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />

      {funds.length === 0 ? (
        <EmptyState icon={Coins} title="No petty cash funds" description="Create a fund with a float (say Rs 20,000), top it up from cash or bank, then record small spends against it." action={canPetty ? <FundDialog /> : undefined} className="mb-8" />
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {funds.map((f) => {
            const low = f.floatAmount > 0 && f.balance < f.floatAmount * 0.2;
            return (
              <Card key={f.id} className={cn("gap-0 py-0", !f.isActive && "opacity-60")}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/accounting/petty-cash/funds/${f.id}`} className="truncate font-medium hover:text-primary hover:underline">
                        {f.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {f.code}
                        {f.custodianName ? ` · Custodian: ${f.custodianName}` : " · No custodian set"}
                      </p>
                    </div>
                    {canPetty && <FundDialog fund={{ id: f.id, name: f.name, custodianName: f.custodianName, floatAmount: f.floatAmount }} />}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className={cn("text-2xl font-semibold tracking-tight", low && "text-warning-foreground dark:text-warning")}>
                        <Amount value={f.balance} />
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Float {formatMoney(f.floatAmount)}</p>
                      <p>Spent this month {formatMoney(f.spentThisMonth)}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Progress value={f.usedPct} aria-label="Share of float used" />
                    <p className="text-xs text-muted-foreground">{f.floatAmount > 0 ? `${f.usedPct.toFixed(0)}% of float used` : "No float set"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canPetty && f.isActive && (
                      <>
                        <Button size="sm" variant={f.replenish > 0 ? "default" : "outline"} disabled={f.replenish <= 0} asChild={f.replenish > 0}>
                          {f.replenish > 0 ? (
                            <Link href={`/accounting/petty-cash/new?fund=${f.id}&type=topup&amount=${f.replenish}`}>
                              <RefreshCw className="size-4" />
                              Replenish {formatMoney(f.replenish)}
                            </Link>
                          ) : (
                            <span>
                              <RefreshCw className="size-4" />
                              At float
                            </span>
                          )}
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/accounting/petty-cash/new?fund=${f.id}`}>
                            <Plus className="size-4" />
                            Voucher
                          </Link>
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/accounting/petty-cash/funds/${f.id}`}>
                        <FileText className="size-4" />
                        Statement
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">Vouchers</h2>
      <div className="mb-3">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>
      <VouchersTable
        data={vouchers}
        canCreate={canPetty}
        toolbar={
          <>
            {funds.length > 1 && <UrlSelect param="fund" value={sp.fund} allLabel="All funds" label="Fund" options={funds.map((f) => ({ value: f.id, label: f.name }))} />}
            <UrlSelect
              param="type"
              value={sp.type}
              allLabel="All types"
              label="Type"
              className="w-36"
              options={[
                { value: "expense", label: "Expenses" },
                { value: "topup", label: "Top-ups" },
              ]}
            />
            <UrlSelect
              param="status"
              value={sp.status}
              allLabel="Any status"
              label="Status"
              className="w-36"
              options={[
                { value: "posted", label: "Posted" },
                { value: "void", label: "Void" },
              ]}
            />
          </>
        }
      />
    </>
  );
}
