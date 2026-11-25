import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/server/auth";
import { listMachineTypes, machineProductionReport } from "@/server/queries/production";
import { formatQty, formatMoney } from "@/lib/format";

export default async function MachineProductionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; machineTypeId?: string }>;
}) {
  await requirePermission("production.view");
  const sp = await searchParams;
  const [rows, machines] = await Promise.all([
    machineProductionReport({ from: sp.from, to: sp.to, machineTypeId: sp.machineTypeId }),
    listMachineTypes(),
  ]);

  const totals = rows.reduce(
    (acc, r) => ({
      workOrderCount: acc.workOrderCount + Number(r.workOrderCount),
      totalProducedQty: acc.totalProducedQty + Number(r.totalProducedQty ?? 0),
      totalMaterialCost: acc.totalMaterialCost + Number(r.totalMaterialCost ?? 0),
      totalLaborCost: acc.totalLaborCost + Number(r.totalLaborCost ?? 0),
      totalOverheadCost: acc.totalOverheadCost + Number(r.totalOverheadCost ?? 0),
      totalCost: acc.totalCost + Number(r.totalCost ?? 0),
    }),
    { workOrderCount: 0, totalProducedQty: 0, totalMaterialCost: 0, totalLaborCost: 0, totalOverheadCost: 0, totalCost: 0 }
  );

  return (
    <>
      <PageHeader
        title="Machine Production Report"
        description="Production output and costs grouped by machine type."
      />

      <Card className="mb-6">
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="from" className="text-xs">From date</Label>
              <Input id="from" name="from" type="date" defaultValue={sp.from ?? ""} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to" className="text-xs">To date</Label>
              <Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="machineTypeId" className="text-xs">Machine type</Label>
              <select
                id="machineTypeId"
                name="machineTypeId"
                defaultValue={sp.machineTypeId ?? ""}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All machines</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm">Apply</Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/production/machine-report">Reset</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Machine</TableHead>
                <TableHead className="text-right">Work Orders</TableHead>
                <TableHead className="text-right">Produced Qty</TableHead>
                <TableHead className="text-right">Material Cost</TableHead>
                <TableHead className="text-right">Labor Cost</TableHead>
                <TableHead className="text-right">Overhead</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No production recorded for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((r) => (
                    <TableRow key={r.machineTypeId}>
                      <TableCell>
                        <div className="font-medium">{r.machineName}</div>
                        <div className="text-xs text-muted-foreground">{r.machineCode}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatQty(Number(r.workOrderCount))}</TableCell>
                      <TableCell className="text-right">{formatQty(Number(r.totalProducedQty ?? 0))}</TableCell>
                      <TableCell className="text-right">{formatMoney(Number(r.totalMaterialCost ?? 0))}</TableCell>
                      <TableCell className="text-right">{formatMoney(Number(r.totalLaborCost ?? 0))}</TableCell>
                      <TableCell className="text-right">{formatMoney(Number(r.totalOverheadCost ?? 0))}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(Number(r.totalCost ?? 0))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{formatQty(totals.workOrderCount)}</TableCell>
                    <TableCell className="text-right">{formatQty(totals.totalProducedQty)}</TableCell>
                    <TableCell className="text-right">{formatMoney(totals.totalMaterialCost)}</TableCell>
                    <TableCell className="text-right">{formatMoney(totals.totalLaborCost)}</TableCell>
                    <TableCell className="text-right">{formatMoney(totals.totalOverheadCost)}</TableCell>
                    <TableCell className="text-right">{formatMoney(totals.totalCost)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
