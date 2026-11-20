"use client";

import Link from "next/link";
import { useState } from "react";
import { Banknote, Landmark, Loader2, Smartphone } from "lucide-react";
import { addBankAccount, editBankAccount } from "@/app/(app)/accounting/banking/actions";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Kind = "cash" | "bank" | "wallet";

const KINDS: { value: Kind; label: string; hint: string; icon: typeof Landmark }[] = [
  { value: "bank", label: "Bank account", hint: "Current or savings account", icon: Landmark },
  { value: "cash", label: "Cash", hint: "Till, safe or cash box", icon: Banknote },
  { value: "wallet", label: "Mobile wallet", hint: "JazzCash, Easypaisa, card float…", icon: Smartphone },
];

interface Details {
  name: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
  branch: string;
}

function DetailFields({ v, set, kind, errors }: { v: Details; set: (p: Partial<Details>) => void; kind: Kind; errors: Record<string, string> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="ba-name">Name</Label>
        <Input id="ba-name" value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder={kind === "cash" ? "e.g. Shop Till" : kind === "wallet" ? "e.g. JazzCash Business" : "e.g. Meezan Bank - Current"} />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>
      {kind !== "cash" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="ba-bank">{kind === "wallet" ? "Provider" : "Bank"}</Label>
            <Input id="ba-bank" value={v.bankName} onChange={(e) => set({ bankName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ba-title">Account title</Label>
            <Input id="ba-title" value={v.accountTitle} onChange={(e) => set({ accountTitle: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ba-no">{kind === "wallet" ? "Wallet / mobile number" : "Account number"}</Label>
            <Input id="ba-no" value={v.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} />
          </div>
          {kind === "bank" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="ba-iban">IBAN</Label>
                <Input id="ba-iban" value={v.iban} onChange={(e) => set({ iban: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ba-branch">Branch</Label>
                <Input id="ba-branch" value={v.branch} onChange={(e) => set({ branch: e.target.value })} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const empty: Details = { name: "", bankName: "", accountTitle: "", accountNumber: "", iban: "", branch: "" };
const orNull = (s: string) => s.trim() || null;

export function BankAccountForm({ defaultDate }: { defaultDate: string }) {
  const [kind, setKind] = useState<Kind>("bank");
  const [v, setV] = useState<Details>(empty);
  const [opening, setOpening] = useState("");
  const [openingDate, setOpeningDate] = useState(defaultDate);
  const { run, pending, fieldErrors } = useAction();

  const submit = () =>
    run(
      () =>
        addBankAccount({
          kind,
          name: v.name.trim(),
          bankName: orNull(v.bankName),
          accountTitle: orNull(v.accountTitle),
          accountNumber: orNull(v.accountNumber),
          iban: orNull(v.iban),
          branch: orNull(v.branch),
          openingBalance: Number(opening) || 0,
          openingDate,
        }),
      { success: (d) => `Account ${d.code} created`, redirectTo: (d) => `/accounting/banking/${d.id}` }
    );

  return (
    <div className="space-y-6 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>Type</CardTitle>
          <CardDescription>Bank accounts and wallets are added under 1200 Bank Accounts; cash under 1100 Cash.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={cn("flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50", kind === k.value && "border-primary bg-primary/5 ring-1 ring-primary")}
            >
              <k.icon className="mt-0.5 size-5 text-primary" />
              <span>
                <span className="block text-sm font-medium">{k.label}</span>
                <span className="block text-xs text-muted-foreground">{k.hint}</span>
              </span>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailFields v={v} set={(p) => setV((x) => ({ ...x, ...p }))} kind={kind} errors={fieldErrors} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Opening balance</CardTitle>
          <CardDescription>Money already in this account when you start using it. Posted against Opening Balance Equity (3300).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="ba-open">Amount</Label>
            <Input id="ba-open" inputMode="decimal" className="text-right tabular" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ba-open-date">As of</Label>
            <Input id="ba-open-date" type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>
      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <Button variant="outline" asChild>
          <Link href="/accounting/banking">Cancel</Link>
        </Button>
        <Button onClick={submit} disabled={pending || v.name.trim().length < 2}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Add account
        </Button>
      </div>
    </div>
  );
}

/** Edit the register's bank details (the GL account itself is edited in the chart of accounts). */
export function EditBankAccountDialog({ id, kind, initial }: { id: string; kind: Kind; initial: Details }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Details>(initial);
  const { run, pending, fieldErrors } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit account details</DialogTitle>
          <DialogDescription>These details print on payment documents and help staff pick the right account.</DialogDescription>
        </DialogHeader>
        <DetailFields v={v} set={(p) => setV((x) => ({ ...x, ...p }))} kind={kind} errors={fieldErrors} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || v.name.trim().length < 2}
            onClick={async () => {
              const res = await run(
                () =>
                  editBankAccount({
                    id,
                    name: v.name.trim(),
                    bankName: orNull(v.bankName),
                    accountTitle: orNull(v.accountTitle),
                    accountNumber: orNull(v.accountNumber),
                    iban: orNull(v.iban),
                    branch: orNull(v.branch),
                  }),
                { success: "Details saved" }
              );
              if (res.ok) setOpen(false);
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
