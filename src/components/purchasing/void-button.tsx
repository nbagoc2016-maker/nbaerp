"use client";

import { useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/app/use-action";

type Result = { ok: true; data: unknown } | { ok: false; error: string };

/** Void a posted document, asking for an optional reason that goes into the audit log. */
export function VoidButton({
  label = "Void",
  title,
  description,
  onVoid,
  disabled,
}: {
  label?: string;
  title: string;
  description: React.ReactNode;
  onVoid: (reason: string | null) => Promise<Result>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending } = useAction();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={disabled}>
          <Ban className="size-4" />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Reason (optional)</Label>
          <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered against the wrong supplier" rows={2} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              const res = await run(() => onVoid(reason.trim() || null), { success: "Voided" });
              if (res.ok) setOpen(false);
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
