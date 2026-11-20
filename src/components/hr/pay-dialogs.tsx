"use client";

import { useState } from "react";
import { Banknote, Loader2 } from "lucide-react";
import { payAllSalariesAction, paySalaryAction } from "@/app/(app)/hr/payroll/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, today } from "@/lib/format";
import { Field } from "./field";
const PAY_METHODS = ["cash", "bank", "cheque", "wallet"] as const;

type Method = (typeof PAY_METHODS)[number];
const METHOD_LABELS: Record<Method, string> = { cash: "Cash", bank: "Bank transfer", cheque: "Cheque", wallet: "Mobile wallet" };

function PaymentFields({
  accounts,
  state,
  setState,
  errors,
}: {
  accounts: ComboOption[];
  state: { date: string; accountId: string | null; method: Method; reference: string };
  setState: (s: Partial<{ date: string; accountId: string | null; method: Method; reference: string }>) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field label="Payment date" error={errors.date}>
        <Input type="date" value={state.date} onChange={(e) => setState({ date: e.target.value })} />
      </Field>
      <Field label="Paid from" error={errors.paidFromAccountId}>
        <Combobox options={accounts} value={state.accountId} onChange={(v) => setState({ accountId: v })} placeholder="Cash or bank account…" />
      </Field>
      <Field label="Method">
        <Select value={state.method} onValueChange={(v) => setState({ method: v as Method })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAY_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {METHOD_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Reference" error={errors.reference}>
        <Input value={state.reference} onChange={(e) => setState({ reference: e.target.value })} placeholder="Cheque / transfer no. (optional)" />
      </Field>
    </>
  );
}

// Salaries for a month posted in the future (e.g. on the 30th) default to being paid on that day, not today,
// so Salaries Payable never shows a payment before the salary was booked.
function usePaymentState(accounts: ComboOption[], method: Method, defaultDate?: string) {
  const t = today();
  const [state, set] = useState<{ date: string; accountId: string | null; method: Method; reference: string }>({ date: defaultDate && defaultDate > t ? defaultDate : t, accountId: accounts[0]?.value ?? null, method, reference: "" });
  return [state, (s: Partial<typeof state>) => set((p) => ({ ...p, ...s }))] as const;
}

/** Pay one payslip (full by default, or part). */
export function PaySalaryDialog({ payslipId, employee, due, accounts, defaultDate }: { payslipId: string; employee: string; due: number; accounts: ComboOption[]; defaultDate?: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(due));
  const [state, setState] = usePaymentState(accounts, "cash", defaultDate);
  const { run, pending, fieldErrors } = useAction();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setAmount(String(due));
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7">
          Pay
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {employee}</DialogTitle>
          <DialogDescription>{formatMoney(due)} is due. Books Salaries Payable against the account you pay from.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                paySalaryAction({
                  payslipId,
                  amount: amount || null,
                  date: state.date,
                  paidFromAccountId: state.accountId ?? "",
                  method: state.method,
                  reference: state.reference,
                }),
              { success: (d) => `${formatMoney(d.amount)} paid to ${employee} (${d.number})`, onSuccess: () => setOpen(false) }
            );
          }}
        >
          <Field label="Amount" error={fieldErrors.amount}>
            <Input type="number" min={0} max={due} step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular text-right" />
          </Field>
          <PaymentFields accounts={accounts} state={state} setState={setState} errors={fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending || !state.accountId || Number(amount) <= 0}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pay everything still due on a posted run, one payment per employee. */
export function PayAllDialog({ runId, due, count, accounts, defaultDate }: { runId: string; due: number; count: number; accounts: ComboOption[]; defaultDate?: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = usePaymentState(accounts, "bank", defaultDate);
  const { run, pending, fieldErrors } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={due <= 0}>
          <Banknote className="size-4" />
          Pay all
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay all salaries</DialogTitle>
          <DialogDescription>
            Pays {formatMoney(due)} to {count} employee{count === 1 ? "" : "s"} — one salary payment each, from the same account.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                payAllSalariesAction({ runId, date: state.date, paidFromAccountId: state.accountId ?? "", method: state.method, reference: state.reference }),
              { success: (d) => `Paid ${formatMoney(d.total)} to ${d.count} employee${d.count === 1 ? "" : "s"}`, onSuccess: () => setOpen(false) }
            );
          }}
        >
          <PaymentFields accounts={accounts} state={state} setState={setState} errors={fieldErrors} />
          <DialogFooter>
            <Button type="submit" disabled={pending || !state.accountId}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Pay {formatMoney(due)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
