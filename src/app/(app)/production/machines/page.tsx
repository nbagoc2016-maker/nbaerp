import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { can, requirePermission } from "@/server/auth";
import { listMachineTypes } from "@/server/queries/production";
import { formatQty } from "@/lib/format";

export default async function MachineTypesPage() {
  const user = await requirePermission("production.view");
  const machines = await listMachineTypes();
  const canManage = can(user, "production.manage");

  return (
    <>
      <PageHeader
        title="Machine Types"
        description="Machines and equipment that work orders can be assigned to for production tracking."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/production/machines/new">
                <Plus className="size-4" />
                New Machine Type
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
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Capacity (units/hr)</TableHead>
                <TableHead className="text-center">Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {machines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="h-32 text-center text-muted-foreground">
                    No machine types defined yet.
                  </TableCell>
                </TableRow>
              ) : (
                machines.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.code}</TableCell>
                    <TableCell>{m.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {m.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.capacity != null ? formatQty(m.capacity) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={m.isActive ? "default" : "secondary"}>
                        {m.isActive ? "Active" : "Archived"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/production/machines/${m.id}`}>
                            <Pencil className="size-4 mr-1" />
                            Edit
                          </Link>
                        </Button>
                      </TableCell>
                    )}
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
