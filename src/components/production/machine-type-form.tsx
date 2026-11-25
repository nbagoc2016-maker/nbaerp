"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveMachineTypeAction } from "@/app/(app)/production/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export interface MachineTypeFormProps {
  initial?: {
    id?: string;
    code: string;
    name: string;
    description?: string | null;
    capacity?: number | null;
    isActive: boolean;
  };
}

export function MachineTypeForm({ initial }: MachineTypeFormProps) {
  const router = useRouter();
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Please enter a machine type name");

    setLoading(true);
    try {
      const res = await saveMachineTypeAction({
        id: initial?.id,
        code: code || undefined,
        name,
        description,
        capacity: capacity === "" ? undefined : Number(capacity),
        isActive,
      });

      if (!res.ok) {
        toast.error(res.error ?? "Failed to save machine type");
      } else {
        toast.success("Machine type saved");
        router.push("/production/machines");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving machine type";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Machine Type Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Auto (e.g. MT-00001)"
              disabled={!!initial?.id}
            />
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tube Drawing Machine"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Capacity (units / hour, optional)</Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="e.g. 120"
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <div className="flex h-9 items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <span className="text-sm text-muted-foreground">{isActive ? "Active" : "Archived"}</span>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Machine details, model, notes..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : initial?.id ? "Update Machine Type" : "Save Machine Type"}
        </Button>
      </div>
    </form>
  );
}
