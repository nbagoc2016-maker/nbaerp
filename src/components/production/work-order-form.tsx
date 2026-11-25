"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveWorkOrderAction } from "@/app/(app)/production/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/app/combobox";
import { today } from "@/lib/format";

export interface WorkOrderFormProps {
  initial?: {
    id?: string;
    number?: string;
    date: string;
    dueDate?: string | null;
    bomId?: string | null;
    productId: string;
    targetQty: number;
    warehouseId: string;
    laborCost?: number;
    overheadCost?: number;
    notes?: string | null;
    lines: { productId: string; plannedQty: number; actualQty?: number; notes?: string | null }[];
  };
  products: { id: string; name: string; sku: string; unit: string }[];
  warehouses: { id: string; name: string }[];
  boms: { id: string; name: string; number: string; productId: string; outputQty: number; laborCost: number; overheadCost: number }[];
}

export function WorkOrderForm({ initial, products, warehouses, boms }: WorkOrderFormProps) {
  const router = useRouter();
  const [date, setDate] = useState(initial?.date ?? today());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [bomId, setBomId] = useState(initial?.bomId ?? "");
  const [productId, setProductId] = useState(initial?.productId ?? "");
  const [targetQty, setTargetQty] = useState(initial?.targetQty ? String(initial.targetQty) : "1");
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? (warehouses[0]?.id ?? ""));
  const [laborCost, setLaborCost] = useState(initial?.laborCost ? String(initial.laborCost) : "0");
  const [overheadCost, setOverheadCost] = useState(initial?.overheadCost ? String(initial.overheadCost) : "0");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState(
    initial?.lines?.length
      ? initial.lines
      : [{ productId: "", plannedQty: 1, actualQty: 1, notes: "" }]
  );
  const [loading, setLoading] = useState(false);

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.sku})`,
    hint: p.unit,
  }));

  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name,
  }));

  const bomOptions = boms.map((b) => ({
    value: b.id,
    label: `${b.name} (${b.number})`,
  }));

  const onBomChange = async (selectedBomId: string) => {
    setBomId(selectedBomId);
    if (!selectedBomId) return;
    const selected = boms.find((b) => b.id === selectedBomId);
    if (selected) {
      setProductId(selected.productId);
      const ratio = Number(targetQty) / (selected.outputQty || 1);
      setLaborCost(String(Math.round(selected.laborCost * ratio * 100) / 100));
      setOverheadCost(String(Math.round(selected.overheadCost * ratio * 100) / 100));
    }
  };

  const addLine = () => {
    setLines([...lines, { productId: "", plannedQty: 1, actualQty: 1, notes: "" }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: string, value: string | number | null) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value ?? "" };
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return toast.error("Please select product to manufacture");
    if (!warehouseId) return toast.error("Please select warehouse");
    if (Number(targetQty) <= 0) return toast.error("Target quantity must be greater than zero");
    if (lines.some((l) => !l.productId || Number(l.plannedQty) <= 0)) {
      return toast.error("All components must have a selected product and valid quantity");
    }

    setLoading(true);
    try {
      const res = await saveWorkOrderAction({
        id: initial?.id,
        date,
        dueDate: dueDate || undefined,
        bomId: bomId || undefined,
        productId,
        targetQty: Number(targetQty),
        warehouseId,
        laborCost: Number(laborCost),
        overheadCost: Number(overheadCost),
        notes,
        lines: lines.map((l) => ({
          productId: l.productId,
          plannedQty: Number(l.plannedQty),
          actualQty: Number(l.actualQty ?? l.plannedQty),
          notes: l.notes || undefined,
        })),
      });

      if (!res.ok) {
        toast.error(res.error ?? "Failed to save work order");
      } else {
        toast.success(`Work order saved`);
        router.push("/production/orders");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving work order";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Work Order Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Due Date (Target Completion)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Target Warehouse</Label>
            <Combobox
              options={warehouseOptions}
              value={warehouseId}
              onChange={(v) => setWarehouseId(v ?? "")}
              placeholder="Select warehouse..."
            />
          </div>
          <div className="space-y-2">
            <Label>From BOM / Recipe (Optional)</Label>
            <Combobox
              options={bomOptions}
              value={bomId}
              onChange={(v) => onBomChange(v ?? "")}
              placeholder="Select BOM..."
            />
          </div>
          <div className="space-y-2">
            <Label>Product to Produce</Label>
            <Combobox
              options={productOptions}
              value={productId}
              onChange={(v) => setProductId(v ?? "")}
              placeholder="Select product..."
            />
          </div>
          <div className="space-y-2">
            <Label>Target Output Quantity</Label>
            <Input
              type="number"
              step="any"
              min="0.001"
              value={targetQty}
              onChange={(e) => setTargetQty(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Estimated Labor Cost</Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={laborCost}
              onChange={(e) => setLaborCost(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Estimated Overhead Cost</Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={overheadCost}
              onChange={(e) => setOverheadCost(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-3">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special instructions or batch notes..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Raw Materials / Components to Issue</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="size-4 mr-1" /> Add Component
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: "40%" }}>Component Product</TableHead>
                <TableHead className="text-right" style={{ width: "25%" }}>
                  Planned Qty
                </TableHead>
                <TableHead style={{ width: "25%" }}>Notes</TableHead>
                <TableHead style={{ width: "50px" }}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Combobox
                      options={productOptions}
                      value={line.productId}
                      onChange={(v) => updateLine(idx, "productId", v)}
                      placeholder="Select raw material..."
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="any"
                      min="0.001"
                      value={line.plannedQty}
                      onChange={(e) => updateLine(idx, "plannedQty", e.target.value)}
                      className="text-right"
                      required
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={line.notes ?? ""}
                      onChange={(e) => updateLine(idx, "notes", e.target.value)}
                      placeholder="Optional notes"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 1}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : initial?.id ? "Update Work Order" : "Save Work Order"}
        </Button>
      </div>
    </form>
  );
}
