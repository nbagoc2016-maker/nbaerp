import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, requirePermission } from "@/server/auth";
import { getWorkOrder } from "@/server/queries/production";
import { formatDate, formatQty, formatMoney } from "@/lib/format";
import { WorkOrderActionsBar } from "@/components/production/work-order-actions";

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("production.view");
  const { id } = await params;
  const data = await getWorkOrder(id);
  if (!data) notFound();

  const { order: o, lines } = data;
  const canManage = can(user, "production.manage");
  const canComplete = can(user, "production.complete");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "confirmed":
        return <Badge variant="secondary">In Progress / Confirmed</Badge>;
      case "completed":
        return <Badge className="bg-emerald-600 hover:bg-emerald-600">Completed</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <>
      <PageHeader
        title={o.number}
        description={`Production of ${o.productName} · Target: ${formatQty(o.targetQty)} ${o.unitCode ?? "pcs"}`}
        backHref="/production/orders"
        badge={getStatusBadge(o.status)}
        actions={
          <div className="flex items-center gap-2">
            {canManage && (o.status === "draft" || o.status === "confirmed") && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/production/orders/${o.id}/edit`}>
                  <Pencil className="size-4 mr-1" />
                  Edit
                </Link>
              </Button>
            )}
            <WorkOrderActionsBar
              order={{
                id: o.id,
                number: o.number,
                status: o.status,
                targetQty: o.targetQty,
                unitCode: o.unitCode,
              }}
              lines={lines}
              canManage={canManage}
              canComplete={canComplete}
            />
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Date: </span>
              <span className="font-medium">{formatDate(o.date)}</span>
            </div>
            {o.dueDate && (
              <div>
                <span className="text-muted-foreground">Due Date: </span>
                <span className="font-medium">{formatDate(o.dueDate)}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Warehouse: </span>
              <span className="font-medium">{o.warehouseName}</span>
            </div>
            {o.machineTypeName && (
              <div>
                <span className="text-muted-foreground">Machine Type: </span>
                <span className="font-medium">
                  {o.machineTypeName}{o.machineTypeCode ? ` (${o.machineTypeCode})` : ""}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Output Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Target Qty: </span>
              <span className="font-medium">
                {formatQty(o.targetQty)} {o.unitCode ?? "pcs"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Produced Qty: </span>
              <span className="font-medium">
                {formatQty(o.producedQty)} {o.unitCode ?? "pcs"}
              </span>
            </div>
            {o.completedAt && (
              <div>
                <span className="text-muted-foreground">Completed On: </span>
                <span className="font-medium">{formatDate(o.completedAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cost Valuation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Material Cost: </span>
              <span className="font-medium">{formatMoney(o.materialCost)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Labor & Overhead: </span>
              <span className="font-medium">{formatMoney(o.laborCost + o.overheadCost)}</span>
            </div>
            <div className="pt-1 border-t">
              <span className="text-muted-foreground">Total Output Value: </span>
              <span className="font-bold text-primary">{formatMoney(o.totalCost)}</span>
              {o.producedQty > 0 && (
                <span className="text-xs text-muted-foreground block">
                  ({formatMoney(o.unitCost)} / {o.unitCode ?? "unit"})
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Components & Raw Materials Used</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Planned Qty</TableHead>
                <TableHead className="text-right">Actual Qty Used</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Total Line Cost</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="font-medium">{l.productName}</div>
                    <div className="text-xs text-muted-foreground">{l.productSku}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatQty(l.plannedQty)} {l.unitCode ?? "pcs"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatQty(l.actualQty)} {l.unitCode ?? "pcs"}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.unitCost > 0 ? formatMoney(l.unitCost) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {l.totalCost > 0 ? formatMoney(l.totalCost) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
