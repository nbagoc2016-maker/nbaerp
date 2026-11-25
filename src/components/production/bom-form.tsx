"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveBomAction } from "@/app/(app)/production/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/app/combobox";

export interface BomFormProps {
  initial?: {
    id?: string;
    number?: string;
    name: string;
    productId: string;
    outputQty: number;
    laborCost: number;
    overheadCost: number;
    notes?: string | null;
    isActive: boolean;
    lines: { productId: string; qty: number; scrapPct?: number; notes?: string | null }[];
  };
  products: { id: string; name: string; sku: string; unit: string }[];
}

export function BomForm({ initial, products }: BomFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [productId, setProductId] = useState(initial?.productId ?? "");
  const [outputQty, setOutputQty] = useState(initial?.outputQty ? String(initial.outputQty) : "1");
  const [laborCost, setLaborCost] = useState(initial?.laborCost ? String(initial.laborCost) : "0");
  const [overheadCost, setOverheadCost] = useState(initial?.overheadCost ? String(initial.overheadCost) : "0");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState(
    initial?.lines?.length
      ? initial.lines
      : [{ productId: "", qty: 1, scrapPct: 0, notes: "" }]
  );
  const [loading, setLoading] = useState(false);

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.sku})`,
    hint: p.unit,
  }));

  const addLine = () => {
    setLines([...lines, { productId: "", qty: 1, scrapPct: 0, notes: "" }]);
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
    if (!name.trim()) return toast.error("Please enter a BOM name");
    if (!productId) return toast.error("Please select a finished good product");
    if (lines.some((l) => !l.productId || Number(l.qty) <= 0)) {
      return toast.error("All components must have a selected product and valid quantity");
    }

    setLoading(true);
    try {
      const res = await saveBomAction({
        id: initial?.id,
        name,
        productId,
        outputQty: Number(outputQty),
        laborCost: Number(laborCost),
        overheadCost: Number(overheadCost),
        notes,
        isActive: true,
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: Number(l.qty),
          scrapPct: Number(l.scrapPct ?? 0),
          notes: l.notes || undefined,
        })),
      });

      if (!res.ok) {
        toast.error(res.error ?? "Failed to save BOM");
      } else {
        toast.success(`BOM saved successfully`);
        router.push("/production/bom");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving BOM";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>BOM Header</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>BOM Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Cotton Shirt Recipe"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Finished Good (Output Item)</Label>
            <Combobox
              options={productOptions}
              value={productId}
              onChange={(v) => setProductId(v ?? "")}
              placeholder="Select finished product..."
            />
          </div>
          <div className="space-y-2">
            <Label>Output Quantity</Label>
            <Input
              type="number"
              step="any"
              min="0.001"
              value={outputQty}
              onChange={(e) => setOutputQty(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Direct Labor Cost per Batch</Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={laborCost}
              onChange={(e) => setLaborCost(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Overhead Cost per Batch</Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={overheadCost}
              onChange={(e) => setOverheadCost(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Notes / Instructions</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Process notes, assembly instructions..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Components / Raw Materials</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="size-4 mr-1" /> Add Component
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: "40%" }}>Component Product</TableHead>
                <TableHead className="text-right" style={{ width: "20%" }}>
                  Required Qty
                </TableHead>
                <TableHead className="text-right" style={{ width: "20%" }}>
                  Scrap / Waste %
                </TableHead>
                <TableHead style={{ width: "20%" }}>Notes</TableHead>
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
                      value={line.qty}
                      onChange={(e) => updateLine(idx, "qty", e.target.value)}
                      className="text-right"
                      required
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={line.scrapPct ?? 0}
                      onChange={(e) => updateLine(idx, "scrapPct", e.target.value)}
                      className="text-right"
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
          {loading ? "Saving..." : initial?.id ? "Update BOM" : "Save BOM"}
        </Button>
      </div>
    </form>
  );
}
