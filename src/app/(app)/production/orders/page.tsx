import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { can, requirePermission } from "@/server/auth";
import { listWorkOrders } from "@/server/queries/production";
import { formatDate, formatQty, formatMoney } from "@/lib/format";

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePermission("production.view");
  const sp = await searchParams;
  const orders = await listWorkOrders({ status: sp.status });
  const canManage = can(user, "production.manage");

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
        title="Work Orders"
        description="Schedule, track and complete manufacturing jobs and finished goods production."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/production/orders/new">
                <Plus className="size-4" />
                New Work Order
              </Link>
            </Button>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Target Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Target Qty</TableHead>
                <TableHead className="text-right">Produced</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    No work orders found.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((wo) => (
                  <TableRow key={wo.id}>
                    <TableCell className="font-medium">
                      <Link href={`/production/orders/${wo.id}`} className="hover:underline text-primary">
                        {wo.number}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(wo.date)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{wo.productName}</div>
                      <div className="text-xs text-muted-foreground">{wo.productSku}</div>
                    </TableCell>
                    <TableCell>{wo.warehouseName}</TableCell>
                    <TableCell className="text-right">
                      {formatQty(wo.targetQty)} {wo.unitCode ?? "pcs"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatQty(wo.producedQty)} {wo.unitCode ?? "pcs"}
                    </TableCell>
                    <TableCell className="text-right">
                      {wo.totalCost > 0 ? formatMoney(wo.totalCost) : "—"}
                    </TableCell>
                    <TableCell className="text-center">{getStatusBadge(wo.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/production/orders/${wo.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
