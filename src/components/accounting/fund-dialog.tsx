"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { saveFund } from "@/app/(app)/accounting/petty-cash/actions";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Create a petty cash fund (GL account under 1100) or edit its name, custodian and float. */
export function FundDialog({ fund }: { fund?: { id: string; name: string; custodianName: string | null; floatAmount: number } }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(fund?.name ?? "");
  const [custodian, setCustodian] = useState(fund?.custodianName ?? "");
  const [float, setFloat] = useState(fund ? String(fund.floatAmount) : "");
  const { run, pending, fieldErrors } = useAction();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {fund ? (
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${fund.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus className="size-4" />
            New fund
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{fund ? `Edit ${fund.name}` : "New petty cash fund"}</DialogTitle>
          <DialogDescription>
            The float is the amount the custodian should hold. Spend from it with vouchers, then top it back up to the float.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="fund-name">Fund name</Label>
            <Input id="fund-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse Petty Cash" />
            {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fund-custodian">Custodian</Label>
            <Input id="fund-custodian" value={custodian} onChange={(e) => setCustodian(e.target.value)} placeholder="Who holds the cash" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fund-float">Float amount</Label>
            <Input id="fund-float" inputMode="decimal" className="text-right tabular" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0.00" />
            {fieldErrors.floatAmount && <p className="text-xs text-destructive">{fieldErrors.floatAmount}</p>}
          </div>
          {!fund && <p className="text-xs text-muted-foreground">A petty cash account is added under 1100 Cash. Fund it with a top-up voucher.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || name.trim().length < 2}
            onClick={async () => {
              const res = await run(() => saveFund({ id: fund?.id, name: name.trim(), custodianName: custodian.trim() || null, floatAmount: Number(float) || 0 }), {
                success: fund ? "Fund updated" : "Fund created",
              });
              if (res.ok) setOpen(false);
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {fund ? "Save" : "Create fund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
