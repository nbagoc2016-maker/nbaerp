import { formatDate, formatMoney, formatQty } from "@/lib/format";

export interface PrintCompany {
  name: string;
  legalName?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  taxNumber?: string | null;
  invoiceFooter?: string | null;
}

export interface PrintLine {
  description: string;
  sku?: string | null;
  qty: number;
  unit?: string | null;
  price: number;
  discountAmount?: number;
  taxAmount?: number;
  lineTotal: number;
}

/**
 * A4 document layout (invoice, quotation, PO, bill, receipt…). Renders as a card on screen and
 * as a clean page when printed (the app chrome is hidden with .no-print).
 */
export function PrintDocument({
  company,
  title,
  number,
  date,
  meta = [],
  party,
  lines,
  totals,
  notes,
  footer,
  showCompanyFooter = false,
}: {
  company: PrintCompany;
  title: string;
  number: string;
  date: string;
  meta?: { label: string; value: React.ReactNode }[];
  party?: { label: string; name: string; lines?: (string | null | undefined)[] };
  lines?: PrintLine[];
  totals?: { label: string; value: number; strong?: boolean }[];
  notes?: string | null;
  footer?: React.ReactNode;
  /** Print the company's customer footer (invoice terms). Only for documents that go to customers. */
  showCompanyFooter?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl rounded-xl border bg-card p-8 text-sm shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="flex flex-col justify-between gap-6 border-b pb-6 sm:flex-row">
        <div className="space-y-1">
          <p className="text-xl font-semibold">{company.name}</p>
          {company.legalName && company.legalName !== company.name && <p className="text-muted-foreground">{company.legalName}</p>}
          {company.address && (
            <p className="text-muted-foreground">
              {company.address}
              {company.city ? `, ${company.city}` : ""}
            </p>
          )}
          <p className="text-muted-foreground">{[company.phone, company.email].filter(Boolean).join(" · ")}</p>
          {company.taxNumber && <p className="text-muted-foreground">NTN / STRN: {company.taxNumber}</p>}
        </div>
        <div className="space-y-1 sm:text-right">
          <p className="text-2xl font-semibold uppercase tracking-wide text-primary">{title}</p>
          <p className="font-medium">{number}</p>
          <p className="text-muted-foreground">{formatDate(date, "long")}</p>
          {meta.map((m) => (
            <p key={m.label} className="text-muted-foreground">
              {m.label}: <span className="text-foreground">{m.value}</span>
            </p>
          ))}
        </div>
      </div>

      {party && (
        <div className="border-b py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{party.label}</p>
          <p className="mt-1 font-medium">{party.name}</p>
          {party.lines?.filter(Boolean).map((l, i) => (
            <p key={i} className="text-muted-foreground">
              {l}
            </p>
          ))}
        </div>
      )}

      {lines && lines.length > 0 && (
        <table className="mt-5 w-full">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Rate</th>
              <th className="py-2 pr-2 text-right">Disc.</th>
              <th className="py-2 pr-2 text-right">Tax</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2 pr-2 align-top text-muted-foreground">{i + 1}</td>
                <td className="py-2 pr-2 align-top">
                  {l.description}
                  {l.sku && <span className="block text-xs text-muted-foreground">{l.sku}</span>}
                </td>
                <td className="py-2 pr-2 text-right align-top tabular">
                  {formatQty(l.qty)} {l.unit}
                </td>
                <td className="py-2 pr-2 text-right align-top tabular">{formatMoney(l.price, { fixed: true })}</td>
                <td className="py-2 pr-2 text-right align-top tabular">{l.discountAmount ? formatMoney(l.discountAmount) : "—"}</td>
                <td className="py-2 pr-2 text-right align-top tabular">{l.taxAmount ? formatMoney(l.taxAmount) : "—"}</td>
                <td className="py-2 text-right align-top font-medium tabular">{formatMoney(l.lineTotal, { fixed: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totals && totals.length > 0 && (
        <div className="mt-4 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5">
            {totals.map((t) => (
              <div key={t.label} className={t.strong ? "flex justify-between border-t pt-2 text-base font-semibold" : "flex justify-between text-muted-foreground"}>
                <dt>{t.label}</dt>
                <dd className="tabular text-foreground">{formatMoney(t.value, { fixed: true })}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {notes && (
        <div className="mt-6 rounded-lg bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-wrap">{notes}</p>
        </div>
      )}

      {footer}
      {showCompanyFooter && company.invoiceFooter && <p className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">{company.invoiceFooter}</p>}
    </div>
  );
}
