import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatQty } from "@/lib/format";
import type { LeaveBalanceData } from "@/server/queries/hr";
import { EmptyState } from "@/components/app/empty-state";
import { EmployeeCell } from "./employee-avatar";

/** Employees × leave types: days taken this year and what is left of the entitlement. */
export function LeaveBalancesTable({ data, linkEmployees = true }: { data: LeaveBalanceData; linkEmployees?: boolean }) {
  if (!data.types.length) return <EmptyState title="No leave types" description="Add leave types (Annual, Sick, Unpaid…) from HR setup to track balances." />;
  if (!data.rows.length) return <EmptyState title="No employees" description="Balances appear once you add employees." />;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="h-10 px-3">Employee</th>
              {data.types.map((t) => (
                <th key={t.id} className="h-10 whitespace-nowrap px-3 text-right">
                  {t.name}
                  <span className="block text-[10px] font-normal normal-case tracking-normal">
                    {t.daysPerYear > 0 ? `${formatQty(t.daysPerYear)} days/yr` : "no limit"}
                    {!t.isPaid && " · unpaid"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">
                  {linkEmployees ? (
                    <Link href={`/hr/employees/${r.id}?tab=leave`} className="hover:underline">
                      <EmployeeCell name={r.name} code={r.code} />
                    </Link>
                  ) : (
                    <EmployeeCell name={r.name} code={r.code} />
                  )}
                </td>
                {r.balances.map((b) => (
                  <td key={b.typeId} className="whitespace-nowrap px-3 py-2 text-right">
                    <span className="tabular font-medium">{formatQty(b.taken)}</span>
                    <span className="text-muted-foreground">
                      {b.remaining !== null ? ` / ${formatQty(b.entitled)}` : " taken"}
                    </span>
                    {b.remaining !== null && (
                      <span
                        className={cn(
                          "tabular block text-xs",
                          b.remaining < 0 ? "text-destructive" : b.remaining === 0 ? "text-warning-foreground dark:text-warning" : "text-success"
                        )}
                      >
                        {b.remaining < 0 ? `${formatQty(-b.remaining)} over` : `${formatQty(b.remaining)} left`}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
