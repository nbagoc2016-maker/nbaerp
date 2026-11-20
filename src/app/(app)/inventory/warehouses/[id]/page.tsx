import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Boxes, ClipboardCheck, Coins, History, Layers } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { StockBadge, WAREHOUSE_TYPES } from "@/components/inventory/shared";
import { DeleteWarehouseButton, LocationsManager, WarehouseForm } from "@/components/inventory/warehouse-forms";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatNumber, formatQty } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getWarehouseDetail } from "@/server/queries/inventory";

export default async function WarehousePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory.view");
  const { id } = await params;
  const d = await getWarehouseDetail(id);
  if (!d) notFound();
  const w = d.warehouse;
  const canCost = can(user, "inventory.cost");
  const canManage = can(user, "inventory.warehouses");
  const inStock = d.stock.filter((s) => s.qty > 0);
  const value = d.stock.reduce((t, s) => t + s.qty * s.avgCost, 0);
  const units = inStock.reduce((t, s) => t + s.qty, 0);

  return (
    <>
      <PageHeader
        title={w.name}
        description={`${w.code} · ${WAREHOUSE_TYPES[w.type]}${w.managerName ? ` · ${w.managerName}` : ""}`}
        backHref="/inventory/warehouses"
        badge={
          <>
            {w.isDefault && <StatusBadge status="approved">Default</StatusBadge>}
            <StatusBadge status={w.isActive ? "active" : "inactive"} />
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/inventory/movements?warehouse=${w.id}`}>
                <History className="size-4" />
                Movements
              </Link>
            </Button>
            {can(user, "inventory.transfer") && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/inventory/transfers/new?from=${w.id}`}>
                  <ArrowLeftRight className="size-4" />
                  Transfer out
                </Link>
              </Button>
            )}
            {can(user, "inventory.adjust") && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/inventory/counts/new?warehouse=${w.id}`}>
                  <ClipboardCheck className="size-4" />
                  Count stock
                </Link>
              </Button>
            )}
            {canManage && !w.isDefault && <DeleteWarehouseButton id={w.id} name={w.name} />}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="SKUs in stock" value={formatNumber(inStock.length)} icon={Boxes} />
        <StatCard label="Units on hand" value={formatQty(units)} icon={Layers} tone="info" />
        {canCost && <StatCard label="Stock value" value={formatMoney(value)} hint="At moving-average cost" icon={Coins} tone="success" className="col-span-2 lg:col-span-1" />}
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          {canManage && (
            <WarehouseForm
              wasDefault={w.isDefault}
              initial={{
                id: w.id,
                code: w.code,
                name: w.name,
                type: w.type,
                address: w.address ?? "",
                phone: w.phone ?? "",
                managerName: w.managerName ?? "",
                isDefault: w.isDefault,
                isActive: w.isActive,
              }}
            />
          )}
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Stock held here</CardTitle>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/inventory/stock?warehouse=${w.id}`}>Open stock on hand</Link>
                </Button>
              </CardAction>
            </CardHeader>
            {d.stock.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nothing is stocked here yet.</p>
            ) : (
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      {canCost && <TableHead className="text-right">Value</TableHead>}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.stock.map((s) => (
                      <TableRow key={s.productId}>
                        <TableCell>
                          <Link href={`/inventory/products/${s.productId}`} className="font-medium hover:underline">
                            {s.name}
                          </Link>
                          <span className="block text-xs text-muted-foreground">{s.sku}</span>
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {formatQty(s.qty)} {s.unit}
                        </TableCell>
                        {canCost && (
                          <TableCell className="text-right">
                            <Money value={s.qty * s.avgCost} />
                          </TableCell>
                        )}
                        <TableCell>
                          <StockBadge qty={s.qty} reorderLevel={s.reorderLevel} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
        <div className="xl:col-span-2">
          <LocationsManager warehouseId={w.id} canEdit={canManage} locations={d.locations.map((l) => ({ id: l.id, code: l.code, name: l.name, isActive: l.isActive }))} />
        </div>
      </div>
    </>
  );
}
