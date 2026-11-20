import Link from "next/link";
import { Building2, MapPin, Phone, Plus, Star, Store, Truck, User, Warehouse } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { WAREHOUSE_TYPES } from "@/components/inventory/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, formatNumber, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { can, requirePermission } from "@/server/auth";
import { listWarehouses } from "@/server/queries/inventory";

const ICONS = { warehouse: Warehouse, shop: Store, transit: Truck } as const;

export default async function WarehousesPage() {
  const user = await requirePermission("inventory.view");
  const canCost = can(user, "inventory.cost");
  const canManage = can(user, "inventory.warehouses");
  const rows = await listWarehouses();
  const totalValue = rows.reduce((t, w) => t + w.value, 0);

  return (
    <>
      <PageHeader
        title="Warehouses"
        description={
          canCost && rows.length
            ? `${rows.filter((w) => w.isActive).length} active locations holding ${formatMoney(totalValue)} of stock.`
            : "Warehouses, shops and transit locations that hold stock."
        }
        actions={
          canManage && (
            <Button asChild>
              <Link href="/inventory/warehouses/new">
                <Plus className="size-4" />
                New warehouse
              </Link>
            </Button>
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No warehouses yet"
          description="Add your main store, shops and any transit location. Every stock quantity belongs to one of them."
          action={
            canManage ? (
              <Button asChild size="sm">
                <Link href="/inventory/warehouses/new">New warehouse</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((w) => {
            const Icon = ICONS[w.type];
            return (
              <Link key={w.id} href={`/inventory/warehouses/${w.id}`} className="group">
                <Card className={cn("h-full gap-0 py-0 transition-colors group-hover:border-primary/40", !w.isActive && "opacity-70")}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold group-hover:underline">{w.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {w.code} · {WAREHOUSE_TYPES[w.type]}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {w.isDefault && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground dark:text-warning">
                            <Star className="size-3" />
                            Default
                          </span>
                        )}
                        {!w.isActive && <StatusBadge status="inactive" />}
                      </div>
                    </div>
                    <dl className={cn("grid gap-2 rounded-lg bg-muted/40 p-3 text-center", canCost ? "grid-cols-3" : "grid-cols-2")}>
                      <div>
                        <dt className="text-xs text-muted-foreground">SKUs</dt>
                        <dd className="font-semibold tabular">{formatNumber(w.skus)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Units</dt>
                        <dd className="font-semibold tabular">{formatQty(w.units)}</dd>
                      </div>
                      {canCost && (
                        <div>
                          <dt className="text-xs text-muted-foreground">Value</dt>
                          <dd className="truncate font-semibold tabular">{formatMoney(w.value)}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {w.managerName && (
                        <p className="flex items-center gap-1.5">
                          <User className="size-3.5" />
                          {w.managerName}
                        </p>
                      )}
                      {w.phone && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="size-3.5" />
                          {w.phone}
                        </p>
                      )}
                      <p className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" />
                        {w.address ? <span className="truncate">{w.address}</span> : "No address"}
                        {w.locations > 0 && <span className="ml-auto">{w.locations} bin(s)</span>}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
