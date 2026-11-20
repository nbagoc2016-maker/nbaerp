import Link from "next/link";
import { AlarmClock, ArrowRight, CheckCircle2, ClipboardList, PackageCheck, Plane, ReceiptText, ShoppingCart, type LucideIcon } from "lucide-react";
import { formatDate, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/server/queries/reports-dashboard";

function ListCard({
  title,
  description,
  href,
  hrefLabel = "View all",
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("h-full gap-3", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {href && (
          <CardAction>
            <Button asChild variant="ghost" size="sm" className="-mr-2 text-muted-foreground">
              <Link href={href}>
                {hrefLabel}
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex-1 px-3">{children}</CardContent>
    </Card>
  );
}

function ListEmpty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-3 py-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-64 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function Row({ href, primary, secondary, right, rightSub }: { href: string; primary: React.ReactNode; secondary: React.ReactNode; right: React.ReactNode; rightSub?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{primary}</p>
          <p className="truncate text-xs text-muted-foreground">{secondary}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="text-sm font-medium">{right}</span>
          {rightSub}
        </div>
      </Link>
    </li>
  );
}

export function RecentInvoices({ rows }: { rows: DashboardData["recentInvoices"] }) {
  return (
    <ListCard title="Recent invoices" description="Latest posted sales" href="/sales/invoices">
      {rows.length ? (
        <ul className="divide-y divide-border/60">
          {rows.map((r) => (
            <Row
              key={r.id}
              href={`/sales/invoices/${r.id}`}
              primary={r.customerName}
              secondary={`${r.number} · ${formatDate(r.date)}`}
              right={<Money value={r.total} />}
              rightSub={<StatusBadge status={r.paymentStatus} />}
            />
          ))}
        </ul>
      ) : (
        <ListEmpty icon={ReceiptText} title="No invoices yet" text="Posted invoices and POS sales show up here." />
      )}
    </ListCard>
  );
}

export function OverdueReceivables({ data }: { data: DashboardData["overdue"] }) {
  return (
    <ListCard
      title="Overdue receivables"
      description={
        data.count ? (
          <>
            {data.count} invoice{data.count === 1 ? "" : "s"} · <Money value={data.amount} className="font-medium text-destructive" />
          </>
        ) : (
          "Invoices past their due date"
        )
      }
      href="/reports/aged-receivables"
      hrefLabel="Ageing"
    >
      {data.rows.length ? (
        <ul className="divide-y divide-border/60">
          {data.rows.map((r) => (
            <Row
              key={r.id}
              href={`/sales/invoices/${r.id}`}
              primary={r.customerName}
              secondary={`${r.number} · due ${formatDate(r.dueDate)}`}
              right={<Money value={r.open} />}
              rightSub={
                <StatusBadge status="overdue">
                  {r.daysOverdue} day{r.daysOverdue === 1 ? "" : "s"}
                </StatusBadge>
              }
            />
          ))}
        </ul>
      ) : (
        <ListEmpty icon={CheckCircle2} title="Nothing overdue" text="Every customer invoice is within its payment terms." />
      )}
    </ListCard>
  );
}

export function LowStock({ data }: { data: DashboardData["lowStock"] }) {
  return (
    <ListCard
      title="Low stock"
      description={data.count ? `${data.count} item${data.count === 1 ? "" : "s"} at or below reorder level` : "Items at or below their reorder level"}
      href="/reports/reorder"
      hrefLabel="Reorder list"
    >
      {data.rows.length ? (
        <ul className="divide-y divide-border/60">
          {data.rows.map((r) => {
            const pctLeft = r.reorderLevel ? Math.max(0, Math.min(100, (r.onHand / r.reorderLevel) * 100)) : 0;
            return (
              <li key={r.id}>
                <Link href={`/inventory/products/${r.id}`} className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.sku}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("tabular text-sm font-medium", r.onHand <= 0 && "text-destructive")}>
                        {formatQty(r.onHand)} {r.unit}
                      </p>
                      <p className="tabular text-xs text-muted-foreground">
                        reorder at {formatQty(r.reorderLevel)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", r.onHand <= 0 ? "bg-destructive" : "bg-warning")} style={{ width: `${Math.max(pctLeft, 3)}%` }} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <ListEmpty icon={PackageCheck} title="Stock levels look healthy" text="Set reorder levels on products to get early warnings here." />
      )}
    </ListCard>
  );
}

export function PendingApprovals({ data, showPurchasing, showLeave }: { data: DashboardData["approvals"]; showPurchasing: boolean; showLeave: boolean }) {
  const total = (showPurchasing ? data.purchaseOrderCount : 0) + (showLeave ? data.leaveCount : 0);
  return (
    <ListCard title="Pending approvals" description={total ? `${total} waiting for a decision` : "Draft purchase orders and leave requests"}>
      {total ? (
        <div className="space-y-3">
          {showPurchasing && data.purchaseOrderCount > 0 && (
            <section>
              <div className="flex items-center justify-between px-3 pb-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ShoppingCart className="size-3.5" /> Purchase orders · {data.purchaseOrderCount}
                </p>
                <Link href="/purchasing/orders" className="text-xs text-primary hover:underline">
                  All
                </Link>
              </div>
              <ul className="divide-y divide-border/60">
                {data.purchaseOrders.map((r) => (
                  <Row
                    key={r.id}
                    href={`/purchasing/orders/${r.id}`}
                    primary={r.supplier || "Supplier"}
                    secondary={`${r.number} · ${formatDate(r.date)}`}
                    right={<Money value={r.total} />}
                    rightSub={<StatusBadge status="draft" />}
                  />
                ))}
              </ul>
            </section>
          )}
          {showLeave && data.leaveCount > 0 && (
            <section>
              <div className="flex items-center justify-between px-3 pb-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Plane className="size-3.5" /> Leave requests · {data.leaveCount}
                </p>
                <Link href="/hr/leave" className="text-xs text-primary hover:underline">
                  All
                </Link>
              </div>
              <ul className="divide-y divide-border/60">
                {data.leave.map((r) => (
                  <Row
                    key={r.id}
                    href="/hr/leave"
                    primary={r.employee}
                    secondary={`${r.type ? `${r.type} · ` : ""}${formatDate(r.fromDate)} – ${formatDate(r.toDate)}`}
                    right={
                      <span className="tabular">
                        {formatQty(r.days)} day{r.days === 1 ? "" : "s"}
                      </span>
                    }
                    rightSub={<StatusBadge status="pending" />}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <ListEmpty icon={ClipboardList} title="All caught up" text="Nothing is waiting for your approval right now." />
      )}
    </ListCard>
  );
}

export function NoWidgets() {
  return (
    <Card>
      <CardContent className="py-2">
        <ListEmpty
          icon={AlarmClock}
          title="Your dashboard is empty for now"
          text="Your role doesn't include any sales, finance or stock figures. Ask an administrator if you need them, or use the shortcuts above."
        />
      </CardContent>
    </Card>
  );
}
