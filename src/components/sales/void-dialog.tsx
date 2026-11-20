"use client";

import { useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string };

/** Destructive action that asks for a short reason (kept in the audit log). */
export function VoidDialog<T>({
  label = "Void",
  title,
  description,
  confirmLabel = "Void",
  onConfirm,
  success,
  redirectTo,
  size = "sm",
}: {
  label?: string;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: (reason: string) => Promise<Result<T>>;
  success?: string;
  redirectTo?: string;
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={size} className="text-destructive hover:text-destructive">
          <Ban className="size-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Reason</Label>
          <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice, customer cancelled…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              const res = await run(() => onConfirm(reason.trim()), { success, redirectTo });
              if (res.ok) setOpen(false);
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
