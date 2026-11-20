import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { PrintDocument } from "@/components/app/print-document";
import { formatQty } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getCount } from "@/server/queries/inventory";

/** Printable count sheet: system quantities with blank boxes for the counters. */
export default async function CountSheetPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ blind?: string }> }) {
  await requirePermission("inventory.view");
  const { id } = await params;
  const sp = await searchParams;
  const [c, company] = await Promise.all([getCount(id), getCompany()]);
  if (!c) notFound();
  const blind = sp.blind === "1"; // hide system qty so counters aren't influenced

  // Group by category so counters can walk the shelves section by section
  const groups = new Map<string, typeof c.lines>();
  for (const l of c.lines) {
    const k = l.category ?? "Uncategorised";
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  let n = 0;

  return (
    <>
      <PageHeader
        className="no-print"
        title={`Count sheet ${c.doc.number}`}
        description={c.warehouse}
        backHref={`/inventory/counts/${id}`}
        actions={
          <>
            <Link href={blind ? `/inventory/counts/${id}/print` : `/inventory/counts/${id}/print?blind=1`} className="text-sm text-primary hover:underline">
              {blind ? "Show system quantities" : "Blind count (hide system qty)"}
            </Link>
            <PrintButton label="Print sheet" />
          </>
        }
      />
      <PrintDocument
        company={company}
        title="Stock Count Sheet"
        number={c.doc.number}
        date={c.doc.date}
        meta={[{ label: "Warehouse", value: c.warehouse }, { label: "Items", value: String(c.lines.length) }]}
        notes={c.doc.notes}
        footer={
          <>
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2">Unit</th>
                  {!blind && <th className="py-2 pr-2 text-right">System</th>}
                  <th className="w-32 py-2 pr-2 text-right">Counted</th>
                  <th className="w-40 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {[...groups].map(([cat, lines]) => (
                  <Fragment key={cat}>
                    <tr>
                      <td colSpan={blind ? 5 : 6} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {cat}
                      </td>
                    </tr>
                    {lines.map((l) => (
                      <tr key={l.id} className="border-b break-inside-avoid">
                        <td className="py-2 pr-2 text-muted-foreground">{++n}</td>
                        <td className="py-2 pr-2">
                          {l.name}
                          <span className="block text-xs text-muted-foreground">
                            {l.sku}
                            {l.barcode ? ` · ${l.barcode}` : ""}
                          </span>
                        </td>
                        <td className="py-2 pr-2">{l.unit}</td>
                        {!blind && <td className="py-2 pr-2 text-right tabular">{formatQty(l.systemQty)}</td>}
                        <td className="py-2 pr-2 text-right tabular">
                          {l.countedQty !== null ? formatQty(l.countedQty) : <span className="inline-block h-6 w-24 border-b border-dashed border-muted-foreground/50" />}
                        </td>
                        <td className="py-2">
                          <span className="inline-block h-6 w-36 border-b border-dashed border-muted-foreground/30" />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <div className="mt-14 grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground">
              {["Counted by", "Checked by", "Approved by"].map((s) => (
                <div key={s} className="border-t pt-2">
                  {s}
                </div>
              ))}
            </div>
          </>
        }
      />
    </>
  );
}
