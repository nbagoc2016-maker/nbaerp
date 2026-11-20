import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { TransfersTable } from "@/components/accounting/transfers-table";
import { Button } from "@/components/ui/button";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { listTransfers } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePermission("accounting.view");
  const period = readPeriod(await searchParams);
  const [rows, company] = await Promise.all([listTransfers(period), getCompany()]);
  const canBank = can(user, "accounting.banking");
  return (
    <>
      <PageHeader
        title="Bank Transfers"
        description="Money moved between your own cash, bank and wallet accounts."
        backHref="/accounting/banking"
        actions={
          canBank ? (
            <Button asChild>
              <Link href="/accounting/banking/transfers/new">
                <ArrowLeftRight className="size-4" />
                Transfer money
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-3">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>
      <TransfersTable data={rows} canTransfer={canBank} />
    </>
  );
}
