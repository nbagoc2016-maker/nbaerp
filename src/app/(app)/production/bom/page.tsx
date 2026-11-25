import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { can, requirePermission } from "@/server/auth";
import { listBoms } from "@/server/queries/production";
import { formatQty, formatMoney } from "@/lib/format";

export default async function BomListPage() {
  const user = await requirePermission("production.view");
  const boms = await listBoms();
  const canManage = can(user, "production.manage");

  return (
    <>
      <PageHeader
        title="Bill of Materials (BOM)"
        description="Standard product recipes, assembly components and overhead cost definitions."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/production/bom/new">
                <Plus className="size-4" />
                New BOM
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
                <TableHead>BOM #</TableHead>
                <TableHead>BOM Name</TableHead>
                <TableHead>Finished Good</TableHead>
                <TableHead className="text-right">Output Qty</TableHead>
                <TableHead className="text-right">Labor Cost</TableHead>
                <TableHead className="text-right">Overhead Cost</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No Bill of Materials created yet.
                  </TableCell>
                </TableRow>
              ) : (
                boms.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <Link href={`/production/bom/${b.id}`} className="hover:underline text-primary">
                        {b.number}
                      </Link>
                    </TableCell>
                    <TableCell>{b.name}</TableCell>
                    <TableCell>
                      <div className="font-medium">{b.productName}</div>
                      <div className="text-xs text-muted-foreground">{b.productSku}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatQty(b.outputQty)} {b.unitCode ?? "pcs"}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(b.laborCost)}</TableCell>
                    <TableCell className="text-right">{formatMoney(b.overheadCost)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={b.isActive ? "default" : "secondary"}>
                        {b.isActive ? "Active" : "Archived"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/production/bom/${b.id}`}>View / Edit</Link>
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
