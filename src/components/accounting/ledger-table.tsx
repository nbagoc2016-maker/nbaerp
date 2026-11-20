import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { GeneralLedger } from "@/server/services/finance-reports";
import { SOURCE_LABELS } from "@/server/services/finance-shared";
import { Amount, csvAmount } from "./amount";
import { SourceLink } from "./source-link";

/** CSV rows for a ledger (header first). */
export function ledgerCsv(gl: GeneralLedger) {
  return [
    ["Date", "Journal", "Source", "Source no.", "Description", "Against", "Party", "Debit", "Credit", "Balance"],
    [gl.from, "", "", "", "Opening balance", "", "", "", "", csvAmount(gl.opening)],
    ...gl.lines.map((l) => [l.date, l.number, SOURCE_LABELS[l.sourceType], l.sourceNumber ?? "", l.memo ?? "", l.against, l.party ?? "", csvAmount(l.debit), csvAmount(l.credit), csvAmount(l.balance)]),
    [gl.to, "", "", "", "Closing balance", "", "", csvAmount(gl.totalDebit), csvAmount(gl.totalCredit), csvAmount(gl.closing)],
  ];
}

/**
 * Ledger / cash book table: opening balance, every posted line with a running balance in the
 * account's normal direction, then period totals and the closing balance.
 */
export function LedgerTable({ gl, inOutLabels }: { gl: GeneralLedger; inOutLabels?: boolean }) {
  const side = gl.debitNormal ? "Dr" : "Cr";
  return (
    <table className="w-full min-w-[820px] text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2 pr-2">Date</th>
          <th className="py-2 pr-2">Journal</th>
          <th className="py-2 pr-2">Source</th>
          <th className="py-2 pr-2">Description</th>
          <th className="py-2 pr-2 text-right">{inOutLabels ? "Money in" : "Debit"}</th>
          <th className="py-2 pr-2 text-right">{inOutLabels ? "Money out" : "Credit"}</th>
          <th className="py-2 text-right">Balance ({side})</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b bg-muted/30 font-medium print:bg-transparent">
          <td className="py-2 pr-2 whitespace-nowrap">{formatDate(gl.from)}</td>
          <td colSpan={5} className="py-2 pr-2">
            Opening balance
          </td>
          <td className="py-2 text-right">
            <Amount value={gl.opening} />
          </td>
        </tr>
        {gl.lines.map((l) => (
          <tr key={l.id} className="border-b align-top last:border-0">
            <td className="py-2 pr-2 whitespace-nowrap">{formatDate(l.date)}</td>
            <td className="py-2 pr-2 whitespace-nowrap">
              <Link href={`/accounting/journals/${l.entryId}`} className="text-primary hover:underline">
                {l.number}
              </Link>
            </td>
            <td className="py-2 pr-2">
              <SourceLink sourceType={l.sourceType} sourceId={l.sourceId} sourceNumber={l.sourceNumber} />
            </td>
            <td className="py-2 pr-2">
              <span className="line-clamp-2">{l.memo ?? "—"}</span>
              {(l.against || l.party) && (
                <span className="block text-xs text-muted-foreground">
                  {l.party && <span className="mr-2">Party: {l.party}</span>}
                  {l.against && <span>Against: {l.against}</span>}
                </span>
              )}
            </td>
            <td className="py-2 pr-2 text-right">{l.debit ? <Amount value={l.debit} /> : ""}</td>
            <td className="py-2 pr-2 text-right">{l.credit ? <Amount value={l.credit} /> : ""}</td>
            <td className="py-2 text-right font-medium">
              <Amount value={l.balance} />
            </td>
          </tr>
        ))}
        {gl.lines.length === 0 && (
          <tr>
            <td colSpan={7} className="py-8 text-center text-muted-foreground">
              No postings in this period.
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr className="border-t-2 font-semibold">
          <td className="py-2 pr-2 whitespace-nowrap">{formatDate(gl.to)}</td>
          <td colSpan={3} className="py-2 pr-2">
            Totals and closing balance
          </td>
          <td className="py-2 pr-2 text-right">
            <Amount value={gl.totalDebit} />
          </td>
          <td className="py-2 pr-2 text-right">
            <Amount value={gl.totalCredit} />
          </td>
          <td className="py-2 text-right">
            <Amount value={gl.closing} />
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
