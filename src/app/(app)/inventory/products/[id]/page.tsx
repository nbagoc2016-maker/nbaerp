import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Boxes, Coins, History, Pencil, ShoppingCart, SlidersHorizontal, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { ProductStatusButton } from "@/components/inventory/doc-buttons";
import { ProductAvatar, RemainingBar, StockBadge } from "@/components/inventory/shared";
import { SOURCE_LABELS, sourceHref } from "@/components/inventory/source-links";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { can, requirePermission } from "@/server/auth";
import { productDetail } from "@/server/queries/products";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory.view");
  const { id } = await params;
  const d = await productDetail(id);
  if (!d) notFound();
  const p = d.product;
  const canCost = can(user, "inventory.cost");
  const canManage = can(user, "inventory.manage");
  const isStock = p.type === "stock";
  const margin = p.salePrice > 0 ? ((p.salePrice - (d.avgCost || p.costPrice)) / p.salePrice) * 100 : null;
  const openBatches = d.batches.filter((b) => b.batch.qty > 0);

  const details: [string, React.ReactNode][] = [
    ["SKU", <span key="sku" className="tabular">{p.sku}</span>],
    ["Barcode", p.barcode ? <span className="tabular">{p.barcode}</span> : "—"],
    ["Type", isStock ? "Stock item" : "Service"],
    ["Category", d.category ?? "—"],
    ["Brand", d.brand ?? "—"],
    ["Unit", `${d.unitName} (${d.unit})`],
    ["Sale price", <Money key="sp" value={p.salePrice} />],
    ["Minimum price", <Money key="mp" value={p.minSalePrice} muteZero />],
    ["Wholesale price", <Money key="wp" value={p.wholesalePrice} muteZero />],
    ["Tax", d.taxName ? `${d.taxName} (${d.taxRate}%)` : "No tax"],
  ];
  if (canCost) details.splice(6, 0, ["Last purchase cost", <Money key="cp" value={p.costPrice} />]);
  if (isStock) details.push(["Reorder level / qty", `${formatQty(p.reorderLevel)} / ${formatQty(p.reorderQty)} ${d.unit}`], ["Rolls / batches", p.trackBatches ? "Tracked" : "Not tracked"]);
  const attrs = [
    ["Colour", p.color],
    ["Size", p.size],
    ["Material", p.material],
  ].filter(([, v]) => v);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <ProductAvatar name={p.name} imageUrl={p.imageUrl} />
            {p.name}
          </span>
        }
        description={[p.sku, d.category, d.brand].filter(Boolean).join(" · ")}
        backHref="/inventory/products"
        badge={
          <>
            <StatusBadge status={p.isActive ? "active" : "inactive"} />
            {isStock && p.isActive && <StockBadge qty={d.onHand} reorderLevel={p.reorderLevel} />}
          </>
        }
        actions={
          <>
            {isStock && can(user, "inventory.transfer") && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/inventory/transfers/new?product=${p.id}`}>
                  <ArrowLeftRight className="size-4" />
                  Transfer
                </Link>
              </Button>
            )}
            {isStock && can(user, "inventory.adjust") && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/inventory/adjustments/new?product=${p.id}`}>
                  <SlidersHorizontal className="size-4" />
                  Adjust
                </Link>
              </Button>
            )}
            {canManage && <ProductStatusButton id={p.id} isActive={p.isActive} />}
            {canManage && (
              <Button asChild size="sm">
                <Link href={`/inventory/products/${p.id}/edit`}>
                  <Pencil className="size-4" />
                  Edit
                </Link>
              </Button>
            )}
          </>
        }
      />

      {isStock && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="On hand" value={`${formatQty(d.onHand)} ${d.unit}`} hint={`${d.byWarehouse.filter((w) => w.qty > 0).length} warehouse(s)`} icon={Boxes} />
          {canCost ? (
            <>
              <StatCard label="Stock value" value={formatMoney(d.value)} hint="At moving-average cost" icon={Coins} tone="info" />
              <StatCard label="Average cost" value={formatMoney(d.avgCost)} hint={margin !== null ? `Margin ${margin.toFixed(1)}% at sale price` : `per ${d.unit}`} icon={TrendingUp} tone="success" />
            </>
          ) : (
            <StatCard label="Sale price" value={formatMoney(p.salePrice)} hint={`per ${d.unit}`} icon={Coins} tone="info" />
          )}
          <StatCard label="Sold last 30 days" value={`${formatQty(d.soldLast30)} ${d.unit}`} hint="Invoices less returns" icon={ShoppingCart} tone="warning" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isStock && (
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>Stock by warehouse</CardTitle>
              </CardHeader>
              {d.byWarehouse.length === 0 ? (
                <CardContent className="py-6">
                  <EmptyState icon={Boxes} title="No stock yet" description="Receive it with a goods receipt, or add it with a stock adjustment." />
                </CardContent>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Warehouse</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="text-right">Reserved</TableHead>
                        {canCost && <TableHead className="text-right">Avg cost</TableHead>}
                        {canCost && <TableHead className="text-right">Value</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.byWarehouse.map((w) => (
                        <TableRow key={w.warehouseId}>
                          <TableCell>
                            <Link href={`/inventory/warehouses/${w.warehouseId}`} className="font-medium hover:underline">
                              {w.warehouse}
                            </Link>
                            <span className="ml-2 text-xs text-muted-foreground">{w.code}</span>
                          </TableCell>
                          <TableCell className={cn("text-right tabular font-medium", w.qty < 0 && "text-destructive")}>{formatQty(w.qty)}</TableCell>
                          <TableCell className="text-right tabular text-muted-foreground">{w.reservedQty ? formatQty(w.reservedQty) : "—"}</TableCell>
                          {canCost && <TableCell className="text-right"><Money value={w.avgCost} /></TableCell>}
                          {canCost && <TableCell className="text-right"><Money value={w.qty * w.avgCost} /></TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right tabular">{formatQty(d.onHand)} {d.unit}</TableCell>
                        <TableCell />
                        {canCost && <TableCell className="text-right"><Money value={d.avgCost} /></TableCell>}
                        {canCost && <TableCell className="text-right"><Money value={d.value} /></TableCell>}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </Card>
          )}

          {isStock && (p.trackBatches || d.batches.length > 0) && (
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>Rolls &amp; batches</CardTitle>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/inventory/batches?product=${p.id}`}>View all</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              {openBatches.length === 0 ? (
                <CardContent className="py-6 text-center text-sm text-muted-foreground">No rolls with stock left.</CardContent>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Roll / batch</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Shade</TableHead>
                        <TableHead className="w-40">Remaining</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Received</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openBatches.slice(0, 20).map(({ batch: b, warehouse }) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium tabular">{b.batchNo}</TableCell>
                          <TableCell>{warehouse}</TableCell>
                          <TableCell>{b.shade ?? "—"}</TableCell>
                          <TableCell>
                            <RemainingBar value={b.qty} max={b.initialQty} />
                          </TableCell>
                          <TableCell className="text-right tabular">
                            {formatQty(b.qty)} <span className="text-muted-foreground">/ {formatQty(b.initialQty)}</span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(b.receivedDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          )}

          {isStock && (
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>Recent movements</CardTitle>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/inventory/movements?product=${p.id}&from=2000-01-01`}>
                      <History className="size-4" />
                      Stock ledger
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              {d.movements.length === 0 ? (
                <CardContent className="py-6 text-center text-sm text-muted-foreground">No stock movements yet.</CardContent>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead className="text-right">In / out</TableHead>
                        {canCost && <TableHead className="text-right">Unit cost</TableHead>}
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.movements.map(({ m, warehouse, batchNo }) => {
                        const reversal = m.sourceType === "adjustment" && (m.sourceNumber?.endsWith("(void)") || m.sourceNumber === "void");
                        const href = reversal ? null : sourceHref(m.sourceType, m.sourceId);
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="whitespace-nowrap">{formatDate(m.date)}</TableCell>
                            <TableCell>
                              <span className="block text-xs text-muted-foreground">{reversal ? "Reversal" : SOURCE_LABELS[m.sourceType]}</span>
                              {href ? (
                                <Link href={href} className="font-medium hover:underline">
                                  {m.sourceNumber ?? "Open"}
                                </Link>
                              ) : (
                                <span className="font-medium">{m.sourceNumber ?? "—"}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {warehouse}
                              {batchNo && <span className="block text-xs text-muted-foreground">Roll {batchNo}</span>}
                            </TableCell>
                            <TableCell className={cn("text-right tabular font-medium", m.qty > 0 ? "text-success" : "text-destructive")}>
                              {m.qty > 0 ? "+" : ""}
                              {formatQty(m.qty)}
                            </TableCell>
                            {canCost && <TableCell className="text-right"><Money value={m.unitCost} /></TableCell>}
                            <TableCell className="text-right tabular">{formatQty(m.balanceQty)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y text-sm">
                {details.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          {(attrs.length > 0 || p.description) && (
            <Card>
              <CardHeader>
                <CardTitle>Attributes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {attrs.length > 0 && (
                  <dl className="divide-y">
                    {attrs.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-2 first:pt-0">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {p.description && <p className="whitespace-pre-wrap text-muted-foreground">{p.description}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
