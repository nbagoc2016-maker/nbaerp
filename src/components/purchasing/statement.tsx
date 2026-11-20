import Link from "next/link";
import { formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/app/money";
import type { PrintCompany } from "@/components/app/print-document";

interface StatementLine {
  id: string;
  date: string;
  type: string;
  reference: string;
  description: string;
  href: string | null;
  debit: number;
  credit: number;
  balance: number;
}

/** Supplier statement: opening, each payable movement with running balance, closing. Prints cleanly. */
export function SupplierStatement({
  company,
  supplier,
  from,
  to,
  data,
}: {
  company: PrintCompany;
  supplier: { name: string; code: string; address?: string | null; city?: string | null; phone?: string | null };
  from: string;
  to: string;
  data: { opening: number; lines: StatementLine[]; totalDebit: number; totalCredit: number; closing: number };
}) {
  return (
    <div className="rounded-xl border bg-card print:border-0">
      <div className="flex flex-col justify-between gap-4 border-b p-5 sm:flex-row">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Statement of account</p>
          <p className="mt-1 text-lg font-semibold">{supplier.name}</p>
          <p className="text-sm text-muted-foreground">
            {supplier.code}
            {supplier.city ? ` · ${supplier.city}` : ""}
            {supplier.phone ? ` · ${supplier.phone}` : ""}
          </p>
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-medium">{company.name}</p>
          <p className="text-muted-foreground">
            {formatDate(from, "long")} – {formatDate(to, "long")}
          </p>
          <p className="mt-2 text-muted-foreground">
            Closing balance: <Money value={data.closing} fixed className="font-semibold text-foreground" />
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs uppercase">Date</TableHead>
              <TableHead className="text-xs uppercase">Type</TableHead>
              <TableHead className="text-xs uppercase">Reference</TableHead>
              <TableHead className="text-xs uppercase">Details</TableHead>
              <TableHead className="text-right text-xs uppercase">Paid / returned</TableHead>
              <TableHead className="text-right text-xs uppercase">Billed</TableHead>
              <TableHead className="text-right text-xs uppercase">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/20">
              <TableCell>{formatDate(from)}</TableCell>
              <TableCell colSpan={5} className="font-medium">
                Opening balance
              </TableCell>
              <TableCell className="text-right font-medium">
                <Money value={data.opening} fixed />
              </TableCell>
            </TableRow>
            {data.lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                  No bills, payments or returns in this period.
                </TableCell>
              </TableRow>
            )}
            {data.lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                <TableCell className="whitespace-nowrap">{l.type}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {l.href ? (
                    <Link href={l.href} className="font-medium text-primary hover:underline">
                      {l.reference}
                    </Link>
                  ) : (
                    l.reference
                  )}
                </TableCell>
                <TableCell className="max-w-72 truncate text-muted-foreground">{l.description}</TableCell>
                <TableCell className="text-right">
                  <Money value={l.debit} fixed muteZero />
                </TableCell>
                <TableCell className="text-right">
                  <Money value={l.credit} fixed muteZero />
                </TableCell>
                <TableCell className="text-right font-medium">
                  <Money value={l.balance} fixed />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="font-semibold">
                Closing balance
              </TableCell>
              <TableCell className="text-right">
                <Money value={data.totalDebit} fixed />
              </TableCell>
              <TableCell className="text-right">
                <Money value={data.totalCredit} fixed />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <Money value={data.closing} fixed />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <p className="border-t px-5 py-3 text-xs text-muted-foreground">
        A positive balance is what {company.name} owes {supplier.name}; a negative balance is an advance paid to them.
      </p>
    </div>
  );
}
