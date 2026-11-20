"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileOutput, Loader2 } from "lucide-react";
import { invoiceFromOrderAction } from "@/app/(app)/sales/orders/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatQty, round3, today } from "@/lib/format";

export interface OrderLineForInvoice {
  id: string;
  description: string;
  sku: string | null;
  unit: string | null;
  allowFraction: boolean;
  qty: number;
  invoicedQty: number;
  remaining: number;
  unitPrice: number;
}

/** Pick how much of each order line to invoice now (defaults to everything left). */
export function OrderInvoiceDialog({
  orderId,
  lines,
  warehouses,
  defaultWarehouseId,
}: {
  orderId: string;
  lines: OrderLineForInvoice[];
  warehouses: ComboOption[];
  defaultWarehouseId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.id, l.remaining])));
  const [date, setDate] = useState(today());
  const [warehouseId, setWarehouseId] = useState<string | null>(defaultWarehouseId);
  const { run, pending } = useAction();
  const router = useRouter();
  const value = lines.reduce((s, l) => s + (qty[l.id] ?? 0) * l.unitPrice, 0);
  const anyLeft = lines.some((l) => l.remaining > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!anyLeft}>
          <FileOutput className="size-4" />
          Create invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Invoice this order</DialogTitle>
          <DialogDescription>Invoice everything that&apos;s left, or just what&apos;s being delivered now. A draft invoice is created for you to review and post.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-date">Invoice date</Label>
            <Input id="inv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Deliver from</Label>
            <Combobox options={warehouses} value={warehouseId} onChange={setWarehouseId} placeholder="Select warehouse…" />
          </div>
        </div>
        <div className="max-h-[50vh] overflow-auto rounded-xl border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Ordered</th>
                <th className="px-3 py-2 text-right">Invoiced</th>
                <th className="w-32 px-3 py-2 text-right">Invoice now</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-3 py-2">
                    <p className="font-medium">{l.description}</p>
                    {l.sku && <p className="text-xs text-muted-foreground">{l.sku}</p>}
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    {formatQty(l.qty)} {l.unit}
                  </td>
                  <td className="px-3 py-2 text-right tabular text-muted-foreground">{formatQty(l.invoicedQty)}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      max={l.remaining}
                      step={l.allowFraction ? 0.01 : 1}
                      disabled={l.remaining <= 0}
                      value={qty[l.id] ?? 0}
                      onChange={(e) => setQty((p) => ({ ...p, [l.id]: Math.min(l.remaining, Math.max(0, round3(Number(e.target.value) || 0))) }))}
                      className="h-8 text-right tabular"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Value before tax & discounts <span className="tabular font-medium text-foreground">{formatMoney(value)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || value <= 0}
              onClick={() =>
                run(
                  () => invoiceFromOrderAction({ orderId, date, warehouseId, lines: lines.map((l) => ({ orderLineId: l.id, qty: qty[l.id] ?? 0 })) }),
                  {
                    success: (d) => `Draft invoice ${d.number} created`,
                    onSuccess: (d) => {
                      setOpen(false);
                      router.push(`/sales/invoices/${d.id}`);
                    },
                    refresh: false,
                  }
                )
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create draft invoice
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
