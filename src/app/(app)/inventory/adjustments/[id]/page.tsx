import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { StatusBadge } from "@/components/app/status-badge";
import { DeleteDraftButton, PostDocButton, VoidDocButton } from "@/components/inventory/doc-buttons";
import { ADJUSTMENT_REASON_LABELS } from "@/components/inventory/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { can, requirePermission } from "@/server/auth";
import { getAdjustment } from "@/server/queries/inventory";

export default async function AdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory.view");
  const { id } = await params;
  const a = await getAdjustment(id);
  if (!a) notFound();
  const { doc } = a;
  const canAct = can(user, "inventory.adjust");
  const canCost = can(user, "inventory.cost");
  const draft = doc.status === "draft";

  return (
    <>
      <PageHeader
        title={doc.number}
        description={`${ADJUSTMENT_REASON_LABELS[doc.reason] ?? doc.reason} · ${a.warehouse} · ${formatDate(doc.date)}`}
        backHref="/inventory/adjustments"
        badge={<StatusBadge status={doc.status} />}
        actions={
          <>
            <PrintButton />
            {canAct && draft && (
              <>
                <DeleteDraftButton kind="adjustment" id={doc.id} number={doc.number} />
                <Button asChild variant="outline" size="sm">
                  <Link href={`/inventory/adjustments/${doc.id}/edit`}>
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                </Button>
                <PostDocButton kind="adjustment" id={doc.id} number={doc.number} />
              </>
            )}
            {canAct && doc.status === "posted" && <VoidDocButton kind="adjustment" id={doc.id} number={doc.number} />}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="gap-0 py-0 lg:col-span-2">
          <CardHeader className="border-b py-4">
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Roll</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  {canCost && <TableHead className="text-right">{draft ? "Unit cost" : "Cost used"}</TableHead>}
                  {canCost && !draft && <TableHead className="text-right">Value</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link href={`/inventory/products/${l.productId}`} className="font-medium hover:underline">
                        {l.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {l.sku}
                        {l.notes ? ` · ${l.notes}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>{l.batchNo ?? "—"}</TableCell>
                    <TableCell className={cn("text-right font-medium tabular", l.qtyChange > 0 ? "text-success" : "text-destructive")}>
                      {l.qtyChange > 0 ? "+" : ""}
                      {formatQty(l.qtyChange)} {l.unit}
                    </TableCell>
                    {canCost && (
                      <TableCell className="text-right">
                        {draft && l.qtyChange < 0 ? <span className="text-xs text-muted-foreground">Average cost</span> : draft && !l.unitCost ? <span className="text-xs text-muted-foreground">Average cost</span> : <Money value={l.unitCost} />}
                      </TableCell>
                    )}
                    {canCost && !draft && (
                      <TableCell className="text-right">
                        <Money value={l.qtyChange * l.unitCost} signed />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
              {canCost && !draft && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-semibold">
                      Net effect on inventory
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      <Money value={doc.totalValue} signed />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {[
                ["Warehouse", a.warehouse],
                ["Reason", ADJUSTMENT_REASON_LABELS[doc.reason] ?? doc.reason],
                ["Date", formatDate(doc.date)],
                ["Prepared by", a.createdBy ?? "—"],
                ["Journal entry", a.journalNumber ?? (draft ? "Created on posting" : "None (no value)")],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            {doc.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{doc.notes}</p>}
            {canCost && !draft && (
              <p className="mt-4 text-xs text-muted-foreground">
                Increases: Dr Inventory 1400 / Cr Inventory Adjustments 5200. Decreases: Dr 5200 / Cr 1400, at the cost shown.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
