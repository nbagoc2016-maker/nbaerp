"use client";

// Confirmed actions for inventory records (post, void, delete, activate). Client wrappers so
// server pages can render them.
import { useState } from "react";
import { Ban, CheckCircle2, Power, Send, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setProductActiveAction } from "@/app/(app)/inventory/products/actions";
import { deleteTransferAction, postTransferAction, voidTransferAction } from "@/app/(app)/inventory/transfers/actions";
import { deleteAdjustmentAction, postAdjustmentAction, voidAdjustmentAction } from "@/app/(app)/inventory/adjustments/actions";
import { voidCountAction } from "@/app/(app)/inventory/counts/actions";

type Kind = "transfer" | "adjustment" | "count";

const LABEL: Record<Kind, string> = { transfer: "transfer", adjustment: "adjustment", count: "stock count" };
const LIST: Record<Kind, string> = { transfer: "/inventory/transfers", adjustment: "/inventory/adjustments", count: "/inventory/counts" };

export function ProductStatusButton({ id, isActive }: { id: string; isActive: boolean }) {
  return (
    <ConfirmButton
      variant="outline"
      title={isActive ? "Deactivate this product?" : "Activate this product?"}
      description={
        isActive
          ? "It will disappear from sales and purchase pickers. Stock and history are kept and you can activate it again any time."
          : "It will be available again in sales and purchase pickers."
      }
      confirmLabel={isActive ? "Deactivate" : "Activate"}
      success={isActive ? "Product deactivated" : "Product activated"}
      onConfirm={() => setProductActiveAction({ id, isActive: !isActive })}
    >
      <Power className="size-4" />
      {isActive ? "Deactivate" : "Activate"}
    </ConfirmButton>
  );
}

export function PostDocButton({ kind, id, number }: { kind: Exclude<Kind, "count">; id: string; number: string }) {
  return (
    <ConfirmButton
      title={`Post ${LABEL[kind]} ${number}?`}
      description={
        kind === "transfer"
          ? "Stock leaves the source warehouse and arrives in the destination at the same cost. Posted transfers can only be voided."
          : "Stock and the general ledger are updated now. Posted adjustments can only be voided."
      }
      confirmLabel="Post"
      success={`${number} posted`}
      onConfirm={() => (kind === "transfer" ? postTransferAction({ id }) : postAdjustmentAction({ id }))}
    >
      <Send className="size-4" />
      Post {LABEL[kind]}
    </ConfirmButton>
  );
}

export function DeleteDraftButton({ kind, id, number }: { kind: Exclude<Kind, "count">; id: string; number: string }) {
  return (
    <ConfirmButton
      variant="outline"
      destructive
      title={`Delete draft ${number}?`}
      description="The draft is removed. Nothing has been posted yet, so stock is not affected."
      confirmLabel="Delete"
      success="Draft deleted"
      redirectTo={LIST[kind]}
      onConfirm={() => (kind === "transfer" ? deleteTransferAction({ id }) : deleteAdjustmentAction({ id }))}
    >
      <Trash2 className="size-4" />
      Delete
    </ConfirmButton>
  );
}

/** Void with an optional reason. Reverses stock (and GL where there is one). */
export function VoidDocButton({ kind, id, number, posted = true }: { kind: Kind; id: string; number: string; posted?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending } = useAction();
  const fn = kind === "transfer" ? voidTransferAction : kind === "adjustment" ? voidAdjustmentAction : voidCountAction;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <Ban className="size-4" />
          {posted ? "Void" : "Cancel count"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {posted ? "Void" : "Cancel"} {LABEL[kind]} {number}?
          </DialogTitle>
          <DialogDescription>
            {posted
              ? kind === "transfer"
                ? "The stock goes back to the source warehouse. This can't be undone."
                : "The stock changes are reversed and the journal entry is voided. This can't be undone."
              : "The count is closed without changing any stock."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Reason (optional)</Label>
          <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              const res = await run(() => fn({ id, reason }), { success: `${number} ${posted ? "voided" : "cancelled"}` });
              if (res.ok) setOpen(false);
            }}
          >
            <CheckCircle2 className="size-4" />
            {posted ? "Void" : "Cancel count"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
