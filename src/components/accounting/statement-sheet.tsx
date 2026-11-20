import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Printable report frame: company name, report title and period on top. On paper the app chrome
 * (sidebar, top bar, filters marked .no-print) disappears and this becomes the whole page.
 */
export function StatementSheet({
  company,
  title,
  subtitle,
  children,
  className,
  footer,
}: {
  company: string;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "statement-sheet rounded-xl border bg-card p-4 text-sm shadow-sm sm:p-6 print:rounded-none print:border-0 print:p-0 print:shadow-none",
        className
      )}
    >
      {/* The shell's sidebar has no print rule of its own; hide it while a statement is printed */}
      <style>{`@media print {
        [data-slot="sidebar"], [data-slot="sidebar-gap"], [data-slot="sidebar-container"] { display: none !important; }
        [data-slot="sidebar-inset"] main { padding: 0 !important; }
        .statement-sheet { font-size: 11px; }
        .statement-sheet tr { break-inside: avoid; }
      }`}</style>
      <div className="mb-4 border-b pb-4 text-center">
        <p className="text-base font-semibold">{company}</p>
        <p className="text-lg font-semibold tracking-tight">{title}</p>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="overflow-x-auto">{children}</div>
      {footer && <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

/** Table row helpers for statements: consistent padding and indentation. */
export function StRow({
  label,
  values,
  depth = 0,
  kind = "line",
  href,
}: {
  label: React.ReactNode;
  values: React.ReactNode[];
  depth?: number;
  kind?: "line" | "heading" | "subtotal" | "total" | "grand";
  href?: string;
}) {
  return (
    <tr
      className={cn(
        "border-b border-border/60 last:border-0",
        kind === "heading" && "border-0 bg-muted/40 print:bg-transparent",
        kind === "subtotal" && "font-medium",
        kind === "total" && "border-t font-semibold",
        kind === "grand" && "border-y-2 border-foreground/70 text-base font-semibold"
      )}
    >
      <td className={cn("py-1.5 pr-3", kind === "heading" && "pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground")} style={{ paddingLeft: `${depth * 1.25}rem` }}>
        {href ? (
          <Link href={href} className="hover:text-primary hover:underline print:no-underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </td>
      {values.map((v, i) => (
        <td key={i} className="py-1.5 pl-3 text-right tabular whitespace-nowrap">
          {v}
        </td>
      ))}
    </tr>
  );
}
