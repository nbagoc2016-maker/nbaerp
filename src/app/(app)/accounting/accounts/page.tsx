import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/db";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { AccountsTree } from "@/components/accounting/accounts-tree";
import type { CoaNode } from "@/components/accounting/account-dialog";
import { fmtAmount } from "@/components/accounting/amount";
import { Button } from "@/components/ui/button";
import { can, requirePermission } from "@/server/auth";
import { chartOfAccounts } from "@/server/services/finance-reports";
import { formatDate, today } from "@/lib/format";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requirePermission("accounting.view");
  const sp = await searchParams;
  const canManage = can(user, "accounting.accounts");
  const chart = await chartOfAccounts(db, today());
  const nodes: CoaNode[] = chart.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
    type: n.type,
    subtype: n.subtype,
    parentId: n.parentId,
    isGroup: n.isGroup,
    isSystem: n.isSystem,
    isActive: n.isActive,
    description: n.description,
    depth: n.depth,
    balance: n.balance,
    hasPostings: n.hasPostings,
    hasChildren: n.hasChildren,
  }));
  const rootTotal = (type: string) => chart.filter((n) => n.depth === 0 && n.type === type).reduce((s, n) => s + n.balance, 0);
  const postable = chart.filter((n) => !n.isGroup && n.isActive).length;

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        description={`Every account in your books with its balance as of ${formatDate(today())}.`}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/accounting/accounts?new=1">
                <Plus className="size-4" />
                New account
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Assets" value={fmtAmount(rootTotal("asset"))} />
        <StatCard label="Liabilities" value={fmtAmount(rootTotal("liability"))} />
        <StatCard label="Equity (posted)" value={fmtAmount(rootTotal("equity"))} hint="Before unclosed profit" />
        <StatCard label="Active accounts" value={postable} hint="that accept postings" />
      </div>
      <AccountsTree key={sp.new ? "new" : "list"} nodes={nodes} canManage={canManage} startNew={!!sp.new} />
    </>
  );
}
