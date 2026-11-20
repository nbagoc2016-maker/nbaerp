import Link from "next/link";
import { AlertTriangle, HandCoins, UserPlus, Users, Wallet } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { CustomersTable } from "@/components/sales/tables";
import { Button } from "@/components/ui/button";
import { can, requirePermission } from "@/server/auth";
import { customerKpis, listCustomers } from "@/server/queries/customers";

export default async function CustomersPage() {
  const user = await requirePermission("parties.view");
  const rows = await listCustomers();
  const k = customerKpis(rows);
  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you sell to, with balances straight from the books."
        actions={
          can(user, "parties.manage") && (
            <Button asChild>
              <Link href="/sales/customers/new">
                <UserPlus className="size-4" />
                New customer
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total receivable" value={<Money value={k.receivable} />} icon={Wallet} hint="What customers owe you" />
        <StatCard
          label="Overdue"
          value={<Money value={k.overdue} />}
          icon={AlertTriangle}
          tone={k.overdue > 0 ? "danger" : "success"}
          hint={`${k.overdueCount} customer${k.overdueCount === 1 ? "" : "s"} past due`}
        />
        <StatCard label="Credit held for customers" value={<Money value={Math.abs(k.credit)} />} icon={HandCoins} tone="info" hint="Advances & overpayments" />
        <StatCard label="Active customers" value={k.active} icon={Users} tone="success" hint={`${k.total} in total`} />
      </div>
      <CustomersTable data={rows} />
    </>
  );
}
