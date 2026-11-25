"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cancelWorkOrderAction, completeWorkOrderAction, confirmWorkOrderAction } from "@/app/(app)/production/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { today } from "@/lib/format";

export function CompleteWorkOrderDialog({
  order,
  lines,
}: {
  order: { id: string; number: string; targetQty: number; unitCode: string | null };
  lines: { id: string; productName: string; plannedQty: number; actualQty: number; unitCode: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [producedQty, setProducedQty] = useState(String(order.targetQty));
  const [completionDate, setCompletionDate] = useState(today());
  const [consumptions, setConsumptions] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, String(l.actualQty || l.plannedQty)]))
  );
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    if (Number(producedQty) <= 0) return toast.error("Produced quantity must be positive");
    setLoading(true);
    try {
      const res = await completeWorkOrderAction({
        id: order.id,
        producedQty: Number(producedQty),
        completionDate,
        consumptions: lines.map((l) => ({
          lineId: l.id,
          actualQty: Number(consumptions[l.id] ?? l.plannedQty),
        })),
      });

      if (!res.ok) {
        toast.error(res.error ?? "Failed to complete work order");
      } else {
        toast.success(`Work order ${order.number} completed! Finished goods added to stock.`);
        setOpen(false);
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error completing work order";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle2 className="size-4 mr-1" /> Complete & Issue Stock
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Complete Work Order: {order.number}</DialogTitle>
          <DialogDescription>
            Confirm actual output and material consumption. Stock will be issued and finished goods will be received.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Final Output Quantity ({order.unitCode ?? "pcs"})</Label>
              <Input
                type="number"
                step="any"
                min="0.001"
                value={producedQty}
                onChange={(e) => setProducedQty(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Completion Date</Label>
              <Input
                type="date"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-semibold">Actual Raw Material Consumption</Label>
            <div className="border rounded-md max-h-60 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Planned Qty</TableHead>
                    <TableHead className="text-right" style={{ width: "140px" }}>
                      Actual Used
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.productName}</TableCell>
                      <TableCell className="text-right">
                        {l.plannedQty} {l.unitCode ?? "pcs"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={consumptions[l.id] ?? l.plannedQty}
                          onChange={(e) =>
                            setConsumptions({ ...consumptions, [l.id]: e.target.value })
                          }
                          className="text-right h-8"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleComplete} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
            {loading ? "Posting..." : "Confirm & Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkOrderActionsBar({
  order,
  lines,
  canManage,
  canComplete,
}: {
  order: { id: string; number: string; status: string; targetQty: number; unitCode: string | null };
  lines: { id: string; productName: string; plannedQty: number; actualQty: number; unitCode: string | null }[];
  canManage: boolean;
  canComplete: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await confirmWorkOrderAction({ id: order.id });
      if (!res.ok) toast.error(res.error ?? "Failed to confirm");
      else {
        toast.success(`Work order ${order.number} confirmed`);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm(`Are you sure you want to cancel work order ${order.number}?`)) return;
    setLoading(true);
    try {
      const res = await cancelWorkOrderAction({ id: order.id });
      if (!res.ok) toast.error(res.error ?? "Failed to cancel");
      else {
        toast.success(`Work order ${order.number} cancelled`);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {order.status === "draft" && canManage && (
        <Button variant="outline" size="sm" onClick={handleConfirm} disabled={loading}>
          Confirm / Start
        </Button>
      )}
      {(order.status === "draft" || order.status === "confirmed") && canComplete && (
        <CompleteWorkOrderDialog order={order} lines={lines} />
      )}
      {order.status !== "completed" && order.status !== "cancelled" && canManage && (
        <Button variant="ghost" size="sm" onClick={handleCancel} disabled={loading} className="text-destructive">
          Cancel Order
        </Button>
      )}
    </div>
  );
}
