import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { formatDate, formatDateTime } from "@/lib/format";

// The app sidebar has no .no-print, so hide it while a report prints, and let wide tables flow
// onto the page instead of being clipped by their horizontal scroll box.
const PRINT_CSS = `@media print {
  [data-slot=sidebar], [data-slot=sidebar-gap], [data-slot=sidebar-container] { display: none !important; }
  [data-slot=sidebar-inset] main { padding: 0 !important; }
  .overflow-x-auto { overflow: visible !important; }
}`;

/**
 * Frame for every report: header with print button, filter bar (hidden when printing), a print-only
 * letterhead with the company and period, summary cards, then the table.
 */
export function ReportShell({
  title,
  description,
  companyName,
  period,
  asOf,
  filters,
  summary,
  children,
}: {
  title: string;
  description: string;
  companyName: string;
  period?: { from: string; to: string };
  asOf?: string;
  filters?: React.ReactNode;
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  const range = period ? `${formatDate(period.from)} – ${formatDate(period.to)}` : asOf ? `As of ${formatDate(asOf, "long")}` : null;
  return (
    <div className="space-y-5">
      <style>{PRINT_CSS}</style>
      <PageHeader className="mb-0 print:hidden" title={title} description={description} backHref="/reports" actions={<PrintButton />} />
      <div className="hidden border-b pb-3 print:block">
        <p className="text-sm text-muted-foreground">{companyName}</p>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {range}
          {range ? " · " : ""}Printed {formatDateTime(new Date())}
        </p>
      </div>
      {filters && <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">{filters}</div>}
      {summary && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">{summary}</div>}
      {children}
    </div>
  );
}
