"use client";

import { useState } from "react";
import { Banknote, CreditCard, Loader2, NotebookPen, Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, round2 } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PayMode = "cash" | "card" | "split" | "account";

export interface PosPayment {
  method: "cash" | "card" | "bank" | "wallet";
  accountId: string;
  amount: number;
  reference: string | null;
}

export interface PaymentAccount {
  value: string;
  label: string;
  subtype: "cash" | "bank";
}

/** Quick cash buttons: exact, then the next round notes above the bill. */
function quickCash(total: number) {
  const out = new Set<number>([total]);
  for (const step of [100, 500, 1000, 5000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 5);
}

export function PaymentDialog({
  open,
  onOpenChange,
  total,
  customerName,
  hasAccount,
  accounts,
  pending,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  total: number;
  customerName: string;
  hasAccount: boolean;
  accounts: PaymentAccount[];
  pending: boolean;
  onComplete: (payments: PosPayment[], tendered: number) => void;
}) {
  const cashAccounts = accounts.filter((a) => a.subtype === "cash");
  const bankAccounts = accounts.filter((a) => a.subtype === "bank");
  // The parent remounts this dialog (key) each time it opens, so state starts fresh for every sale
  const [mode, setMode] = useState<PayMode>(cashAccounts.length ? "cash" : "card");
  const [tendered, setTendered] = useState<string>(String(total));
  const [cashAccount, setCashAccount] = useState(cashAccounts[0]?.value ?? "");
  const [bankAccount, setBankAccount] = useState(bankAccounts[0]?.value ?? "");
  const [cardMethod, setCardMethod] = useState<"card" | "bank" | "wallet">("card");
  const [cardAmount, setCardAmount] = useState<string>("");
  const [reference, setReference] = useState("");

  const tenderedNum = round2(Number(tendered) || 0);
  const cardNum = round2(Math.min(Number(cardAmount) || 0, total));
  const cashDue = mode === "cash" ? total : mode === "split" ? round2(total - cardNum) : 0;
  const change = mode === "cash" || mode === "split" ? round2(tenderedNum - cashDue) : 0;
  const paidNow = mode === "card" ? total : mode === "account" ? tenderedNum : round2(Math.min(tenderedNum, cashDue) + (mode === "split" ? cardNum : 0));
  const short = round2(total - paidNow);
  const valid =
    total > 0 &&
    (mode === "cash"
      ? !!cashAccount && short <= 0.005
      : mode === "card"
        ? !!bankAccount
        : mode === "split"
          ? !!bankAccount && cardNum > 0 && (cashDue <= 0 || !!cashAccount) && short <= 0.005
          : hasAccount && (tenderedNum === 0 || !!cashAccount));

  const complete = () => {
    if (!valid || pending) return;
    const pays: PosPayment[] = [];
    if (mode === "card") pays.push({ method: cardMethod, accountId: bankAccount, amount: total, reference: reference || null });
    if (mode === "split") pays.push({ method: cardMethod, accountId: bankAccount, amount: cardNum, reference: reference || null });
    if ((mode === "cash" || mode === "split" || mode === "account") && tenderedNum > 0) pays.push({ method: "cash", accountId: cashAccount, amount: tenderedNum, reference: null });
    onComplete(pays, mode === "card" ? 0 : tenderedNum);
  };

  const reset = (m: PayMode) => {
    setMode(m);
    setTendered(m === "account" ? "" : m === "cash" ? String(total) : "");
    if (m === "split") setCardAmount("");
  };

  const modes: { key: PayMode; label: string; icon: typeof Banknote; show: boolean }[] = [
    { key: "cash", label: "Cash", icon: Banknote, show: cashAccounts.length > 0 },
    { key: "card", label: "Card / Bank", icon: CreditCard, show: bankAccounts.length > 0 },
    { key: "split", label: "Split", icon: Split, show: cashAccounts.length > 0 && bankAccounts.length > 0 },
    { key: "account", label: "On account", icon: NotebookPen, show: hasAccount },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            complete();
          }}
          className="space-y-5"
        >
          <DialogHeader>
            <DialogTitle>Take payment</DialogTitle>
            <DialogDescription>{customerName}</DialogDescription>
          </DialogHeader>

          <div className="rounded-xl bg-primary/8 p-4 text-center ring-1 ring-primary/15">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Amount due</p>
            <p className="tabular text-4xl font-bold tracking-tight text-primary">{formatMoney(total)}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {modes
              .filter((x) => x.show)
              .map((x) => (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => reset(x.key)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium transition-colors",
                    mode === x.key ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  <x.icon className="size-5" />
                  {x.label}
                </button>
              ))}
          </div>

          {(mode === "card" || mode === "split") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Paid by</Label>
                <Select value={cardMethod} onValueChange={(v) => setCardMethod(v as typeof cardMethod)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank transfer</SelectItem>
                    <SelectItem value="wallet">Mobile wallet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Into account</Label>
                <Select value={bankAccount} onValueChange={setBankAccount}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mode === "split" && (
                <div className="space-y-1.5">
                  <Label htmlFor="pos-card-amount">Card / bank amount</Label>
                  <Input
                    id="pos-card-amount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={total}
                    step="0.01"
                    value={cardAmount}
                    onChange={(e) => setCardAmount(e.target.value)}
                    autoFocus
                    className="h-11 text-lg tabular"
                  />
                </div>
              )}
              <div className={cn("space-y-1.5", mode === "card" && "sm:col-span-2")}>
                <Label htmlFor="pos-ref">Reference</Label>
                <Input id="pos-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Last 4 digits / slip no." autoFocus={mode === "card"} />
              </div>
            </div>
          )}

          {(mode === "cash" || mode === "split" || mode === "account") && (
            <div className="space-y-3">
              {mode === "split" && cardNum > 0 && (
                <p className="text-sm text-muted-foreground">
                  Cash to collect <span className="tabular font-semibold text-foreground">{formatMoney(cashDue)}</span>
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="pos-tendered">{mode === "account" ? "Paid now in cash (optional)" : "Cash received"}</Label>
                <Input
                  id="pos-tendered"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  autoFocus={mode !== "split"}
                  className="h-12 text-2xl font-semibold tabular"
                />
              </div>
              {mode !== "account" && cashDue > 0 && (
                <div className="flex flex-wrap gap-2">
                  {quickCash(cashDue).map((v) => (
                    <Button key={v} type="button" variant="outline" size="sm" onClick={() => setTendered(String(v))} className="tabular">
                      {v === cashDue ? "Exact" : formatMoney(v)}
                    </Button>
                  ))}
                </div>
              )}
              {cashAccounts.length > 1 && (
                <Select value={cashAccount} onValueChange={setCashAccount}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Cash drawer" />
                  </SelectTrigger>
                  <SelectContent>
                    {cashAccounts.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div
            className={cn(
              "flex items-center justify-between rounded-xl p-4",
              mode === "account" ? "bg-info/10" : short > 0.005 ? "bg-destructive/10" : "bg-success/12"
            )}
          >
            <span className="text-sm font-medium">{mode === "account" ? "Goes on account" : short > 0.005 ? "Still to collect" : "Change due"}</span>
            <span
              className={cn(
                "tabular text-2xl font-bold",
                mode === "account" ? "text-info" : short > 0.005 ? "text-destructive" : "text-success"
              )}
            >
              {formatMoney(mode === "account" ? Math.max(0, short) : short > 0.005 ? short : Math.max(0, change))}
            </span>
          </div>

          <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={!valid || pending}>
            {pending && <Loader2 className="size-5 animate-spin" />}
            Complete sale
            <kbd className="ml-2 rounded border border-primary-foreground/30 px-1.5 text-[10px] font-normal opacity-80">Enter</kbd>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
