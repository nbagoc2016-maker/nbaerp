// Financial statement tables (server-rendered) and their CSV rows.
import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BalanceSheet, CashFlow, ProfitAndLoss } from "@/server/services/finance-reports";
import type { TrialBalanceRow } from "@/server/services/finance-reports";
import { ACCOUNT_TYPE_LABELS, SOURCE_LABELS, pctChange } from "@/server/services/finance-shared";
import { Amount, csvAmount } from "./amount";
import { StRow } from "./statement-sheet";

type Cell = string | number | null | undefined;

const ledgerHref = (accountId: string, f: { from?: string; to: string }) =>
  `/accounting/ledger?account=${accountId}${f.from ? `&from=${f.from}` : ""}&to=${f.to}`;

function Check({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <div className={cn("mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm font-medium", ok ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive")}>
      {ok ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}
      {ok ? okText : badText}
    </div>
  );
}

// ---- Trial balance ----------------------------------------------------------------------------

export interface TrialBalanceData {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
}

export function trialBalanceCsv(tb: TrialBalanceData): Cell[][] {
  return [
    ["Code", "Account", "Type", "Debit", "Credit"],
    ...tb.rows.map((r) => [r.code, r.name, ACCOUNT_TYPE_LABELS[r.type], r.debit ? csvAmount(r.debit) : "", r.credit ? csvAmount(r.credit) : ""]),
    ["", "Total", "", csvAmount(tb.totalDebit), csvAmount(tb.totalCredit)],
  ];
}

export function TrialBalanceTable({ tb }: { tb: TrialBalanceData }) {
  return (
    <>
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-20 py-2 pr-2">Code</th>
            <th className="py-2 pr-2">Account</th>
            <th className="hidden py-2 pr-2 sm:table-cell">Type</th>
            <th className="py-2 pl-3 text-right">Debit</th>
            <th className="py-2 pl-3 text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {tb.rows.map((r) => (
            <tr key={r.id} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-2 font-mono text-xs text-muted-foreground">{r.code}</td>
              <td className="py-1.5 pr-2">
                <Link href={ledgerHref(r.id, { to: tb.asOf })} className="hover:text-primary hover:underline print:no-underline">
                  {r.name}
                </Link>
              </td>
              <td className="hidden py-1.5 pr-2 text-muted-foreground sm:table-cell">{ACCOUNT_TYPE_LABELS[r.type]}</td>
              <td className="py-1.5 pl-3 text-right">{r.debit ? <Amount value={r.debit} /> : ""}</td>
              <td className="py-1.5 pl-3 text-right">{r.credit ? <Amount value={r.credit} /> : ""}</td>
            </tr>
          ))}
          {tb.rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-muted-foreground">
                Nothing has been posted yet.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-y-2 border-foreground/70 text-base font-semibold">
            <td />
            <td className="py-2">Total</td>
            <td className="hidden sm:table-cell" />
            <td className="py-2 pl-3 text-right">
              <Amount value={tb.totalDebit} />
            </td>
            <td className="py-2 pl-3 text-right">
              <Amount value={tb.totalCredit} />
            </td>
          </tr>
        </tfoot>
      </table>
      <Check ok={tb.balanced} okText="Debits equal credits — the trial balance agrees." badText={`Out of balance by ${Math.abs(tb.difference).toFixed(2)}. Check for corrupted postings.`} />
    </>
  );
}

// ---- Profit & loss ----------------------------------------------------------------------------

interface PnlRow {
  kind: "line" | "heading" | "subtotal" | "total" | "grand" | "ratio";
  label: string;
  depth: number;
  cur: number | null;
  prev: number | null;
  href?: string;
  /** Expense-like rows: an increase is bad */
  cost?: boolean;
}

function pnlRows(cur: ProfitAndLoss, prev: ProfitAndLoss | null): PnlRow[] {
  const rows: PnlRow[] = [];
  const lines = (pick: (p: ProfitAndLoss) => ProfitAndLoss["sales"], sign: 1 | -1, opts: { cost?: boolean } = {}) => {
    const ids = new Map<string, { code: string; name: string }>();
    for (const p of [cur, prev]) if (p) for (const l of pick(p).lines) ids.set(l.accountId, { code: l.code, name: l.name });
    const sorted = [...ids.entries()].sort((a, b) => a[1].code.localeCompare(b[1].code));
    for (const [id, a] of sorted) {
      const c = pick(cur).lines.find((l) => l.accountId === id)?.amount ?? 0;
      const p = prev ? (pick(prev).lines.find((l) => l.accountId === id)?.amount ?? 0) : null;
      rows.push({ kind: "line", label: `${a.code} ${a.name}`, depth: 1, cur: sign * c, prev: p === null ? null : sign * p, href: ledgerHref(id, cur), cost: opts.cost });
    }
  };
  const v = (f: (p: ProfitAndLoss) => number) => ({ cur: f(cur), prev: prev ? f(prev) : null });

  rows.push({ kind: "heading", label: "Revenue", depth: 0, cur: null, prev: null });
  lines((p) => p.sales, 1);
  if (cur.returns.lines.length || prev?.returns.lines.length) {
    lines((p) => p.returns, -1, { cost: true });
  }
  rows.push({ kind: "subtotal", label: "Net revenue", depth: 0, ...v((p) => p.netRevenue) });

  rows.push({ kind: "heading", label: "Cost of sales", depth: 0, cur: null, prev: null });
  lines((p) => p.costOfSales, 1, { cost: true });
  rows.push({ kind: "subtotal", label: "Total cost of sales", depth: 0, cost: true, ...v((p) => p.costOfSales.total) });
  rows.push({ kind: "total", label: "Gross profit", depth: 0, ...v((p) => p.grossProfit) });
  rows.push({ kind: "ratio", label: "Gross margin", depth: 1, ...v((p) => p.grossMargin ?? 0) });

  rows.push({ kind: "heading", label: "Operating expenses", depth: 0, cur: null, prev: null });
  lines((p) => p.operatingExpenses, 1, { cost: true });
  rows.push({ kind: "subtotal", label: "Total operating expenses", depth: 0, cost: true, ...v((p) => p.operatingExpenses.total) });
  rows.push({ kind: "total", label: "Operating profit", depth: 0, ...v((p) => p.operatingProfit) });

  if (cur.otherIncome.lines.length || prev?.otherIncome.lines.length) {
    rows.push({ kind: "heading", label: "Other income", depth: 0, cur: null, prev: null });
    lines((p) => p.otherIncome, 1);
    rows.push({ kind: "subtotal", label: "Total other income", depth: 0, ...v((p) => p.otherIncome.total) });
  }
  rows.push({ kind: "grand", label: "Net profit", depth: 0, ...v((p) => p.netProfit) });
  rows.push({ kind: "ratio", label: "Net margin", depth: 1, ...v((p) => p.netMargin ?? 0) });
  return rows;
}

export function profitAndLossCsv(cur: ProfitAndLoss, prev: ProfitAndLoss | null): Cell[][] {
  const head: Cell[] = ["Line", `${cur.from} to ${cur.to}`];
  if (prev) head.push(`${prev.from} to ${prev.to}`, "Change %");
  return [
    head,
    ...pnlRows(cur, prev).map((r) => {
      const fmt = (n: number | null) => (n === null ? "" : r.kind === "ratio" ? `${n.toFixed(1)}%` : csvAmount(n));
      const out: Cell[] = [r.label, fmt(r.cur)];
      if (prev) {
        const ch = r.cur !== null && r.prev !== null && r.kind !== "ratio" ? pctChange(r.cur, r.prev) : null;
        out.push(fmt(r.prev), ch === null ? "" : ch.toFixed(1));
      }
      return out;
    }),
  ];
}

function ChangeCell({ cur, prev, cost }: { cur: number; prev: number; cost?: boolean }) {
  const ch = pctChange(cur, prev);
  if (ch === null) return <span className="text-muted-foreground">—</span>;
  const good = cost ? ch <= 0 : ch >= 0;
  return <span className={cn("tabular", Math.abs(ch) < 0.05 ? "text-muted-foreground" : good ? "text-success" : "text-destructive")}>{`${ch > 0 ? "+" : ""}${ch.toFixed(1)}%`}</span>;
}

export function ProfitAndLossTable({ cur, prev }: { cur: ProfitAndLoss; prev: ProfitAndLoss | null }) {
  const rows = pnlRows(cur, prev);
  return (
    <table className="w-full min-w-[520px] text-sm">
      <thead>
        <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2 pr-3 text-left" />
          <th className="py-2 pl-3 text-right">{prev ? "This period" : "Amount"}</th>
          {prev && <th className="py-2 pl-3 text-right">Previous</th>}
          {prev && <th className="py-2 pl-3 text-right">Change</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          if (r.kind === "heading") return <StRow key={i} kind="heading" label={r.label} values={prev ? ["", "", ""] : [""]} />;
          const fmt = (n: number | null) =>
            n === null ? "" : r.kind === "ratio" ? <span className="text-muted-foreground">{n.toFixed(1)}%</span> : <Amount value={n} muteZero={r.kind === "line"} />;
          const values = [fmt(r.cur)];
          if (prev) {
            values.push(fmt(r.prev));
            values.push(r.kind === "ratio" || r.cur === null || r.prev === null ? "" : <ChangeCell cur={r.cur} prev={r.prev} cost={r.cost} />);
          }
          return (
            <StRow
              key={i}
              kind={r.kind === "ratio" || r.kind === "line" ? "line" : r.kind}
              label={r.kind === "ratio" ? <span className="text-muted-foreground">{r.label}</span> : r.label}
              depth={r.depth}
              href={r.href}
              values={values}
            />
          );
        })}
      </tbody>
    </table>
  );
}

// ---- Balance sheet ----------------------------------------------------------------------------

export function balanceSheetCsv(bs: BalanceSheet): Cell[][] {
  const out: Cell[][] = [["Line", `As of ${bs.asOf}`]];
  for (const s of [bs.assets, bs.liabilities, bs.equity]) {
    out.push([s.title.toUpperCase(), ""]);
    for (const r of s.rows) out.push([`${"  ".repeat(r.depth + 1)}${r.kind === "group" ? r.name : r.kind === "total" ? r.name : `${r.code} ${r.name}`.trim()}`, r.kind === "group" ? "" : csvAmount(r.amount)]);
    out.push([`Total ${s.title.toLowerCase()}`, csvAmount(s.total)]);
  }
  out.push(["Total liabilities and equity", csvAmount(bs.totalLiabilitiesAndEquity)]);
  return out;
}

export function BalanceSheetTable({ bs }: { bs: BalanceSheet }) {
  const section = (s: BalanceSheet["assets"], grand = false) => (
    <>
      <StRow kind="heading" label={s.title} values={[""]} />
      {s.rows.map((r) =>
        r.kind === "group" ? (
          <StRow key={r.id} kind="subtotal" label={r.name} depth={r.depth + 1} values={[""]} />
        ) : r.kind === "total" ? (
          <StRow key={r.id} kind="subtotal" label={r.name} depth={r.depth + 1} values={[<Amount key="v" value={r.amount} />]} />
        ) : (
          <StRow
            key={r.id}
            label={r.code ? `${r.code} ${r.name}` : <span className="italic">{r.name}</span>}
            depth={r.depth + 1}
            href={r.code ? ledgerHref(r.id, { to: bs.asOf }) : undefined}
            values={[<Amount key="v" value={r.amount} />]}
          />
        )
      )}
      {s.rows.length === 0 && <StRow label={<span className="text-muted-foreground">No balances</span>} depth={1} values={[""]} />}
      <StRow kind={grand ? "grand" : "total"} label={`Total ${s.title.toLowerCase()}`} values={[<Amount key="v" value={s.total} />]} />
    </>
  );
  return (
    <>
      <table className="w-full min-w-[420px] text-sm">
        <tbody>
          {section(bs.assets, true)}
          {section(bs.liabilities)}
          {section(bs.equity)}
          <StRow kind="grand" label="Total liabilities and equity" values={[<Amount key="v" value={bs.totalLiabilitiesAndEquity} />]} />
        </tbody>
      </table>
      <Check
        ok={bs.balanced}
        okText="Balanced — total assets equal liabilities plus equity."
        badText={`Out of balance by ${Math.abs(bs.difference).toFixed(2)}. Assets don't equal liabilities plus equity.`}
      />
    </>
  );
}

// ---- Cash flow --------------------------------------------------------------------------------

export function cashFlowCsv(cf: CashFlow): Cell[][] {
  return [
    ["Line", "Amount"],
    ["Opening cash and bank", csvAmount(cf.opening)],
    ["CASH IN", ""],
    ...cf.rows.filter((r) => r.inflow).map((r) => [`  ${SOURCE_LABELS[r.sourceType]}`, csvAmount(r.inflow)]),
    ["Total cash in", csvAmount(cf.totalIn)],
    ["CASH OUT", ""],
    ...cf.rows.filter((r) => r.outflow).map((r) => [`  ${SOURCE_LABELS[r.sourceType]}`, csvAmount(-r.outflow)]),
    ["Total cash out", csvAmount(-cf.totalOut)],
    ["Net change in cash", csvAmount(cf.net)],
    ["Closing cash and bank", csvAmount(cf.closing)],
  ];
}

export function CashFlowTable({ cf }: { cf: CashFlow }) {
  const ins = cf.rows.filter((r) => r.inflow > 0).sort((a, b) => b.inflow - a.inflow);
  const outs = cf.rows.filter((r) => r.outflow > 0).sort((a, b) => b.outflow - a.outflow);
  return (
    <div className="space-y-6">
      <table className="w-full min-w-[420px] text-sm">
        <tbody>
          <StRow kind="total" label="Opening cash & bank" values={[<Amount key="v" value={cf.opening} />]} />
          <StRow kind="heading" label="Cash in" values={[""]} />
          {ins.map((r) => (
            <StRow key={`in-${r.sourceType}`} label={`${SOURCE_LABELS[r.sourceType]} (${r.count})`} depth={1} values={[<Amount key="v" value={r.inflow} />]} />
          ))}
          {ins.length === 0 && <StRow label={<span className="text-muted-foreground">No money received</span>} depth={1} values={[""]} />}
          <StRow kind="subtotal" label="Total cash in" values={[<Amount key="v" value={cf.totalIn} />]} />
          <StRow kind="heading" label="Cash out" values={[""]} />
          {outs.map((r) => (
            <StRow key={`out-${r.sourceType}`} label={`${SOURCE_LABELS[r.sourceType]} (${r.count})`} depth={1} values={[<Amount key="v" value={-r.outflow} />]} />
          ))}
          {outs.length === 0 && <StRow label={<span className="text-muted-foreground">No money paid out</span>} depth={1} values={[""]} />}
          <StRow kind="subtotal" label="Total cash out" values={[<Amount key="v" value={-cf.totalOut} />]} />
          <StRow kind="total" label="Net change in cash" values={[<Amount key="v" value={cf.net} />]} />
          <StRow kind="grand" label="Closing cash & bank" values={[<Amount key="v" value={cf.closing} />]} />
        </tbody>
      </table>
      {cf.internalCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {cf.internalCount} transfer{cf.internalCount === 1 ? "" : "s"} between your own cash, bank and petty cash accounts left the total unchanged and {cf.internalCount === 1 ? "is" : "are"} not
          shown as cash in or out.
        </p>
      )}
      {cf.accounts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">By account</p>
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 text-left">Account</th>
                <th className="py-2 pl-3 text-right">Opening</th>
                <th className="py-2 pl-3 text-right">In</th>
                <th className="py-2 pl-3 text-right">Out</th>
                <th className="py-2 pl-3 text-right">Closing</th>
              </tr>
            </thead>
            <tbody>
              {cf.accounts.map((a) => (
                <tr key={a.id} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-2">
                    <Link href={ledgerHref(a.id, cf)} className="hover:text-primary hover:underline print:no-underline">
                      <span className="font-mono text-xs text-muted-foreground">{a.code}</span> {a.name}
                    </Link>
                  </td>
                  <td className="py-1.5 pl-3 text-right"><Amount value={a.opening} /></td>
                  <td className="py-1.5 pl-3 text-right"><Amount value={a.inflow} muteZero /></td>
                  <td className="py-1.5 pl-3 text-right"><Amount value={a.outflow ? -a.outflow : 0} muteZero /></td>
                  <td className="py-1.5 pl-3 text-right font-medium"><Amount value={a.closing} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
