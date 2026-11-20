// Small presentational helpers shared by sales screens (server- and client-safe: no hooks).
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  card: "Card",
  cheque: "Cheque",
  wallet: "Mobile wallet",
};

export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  retail: "Retail",
  wholesale: "Wholesale",
  corporate: "Corporate",
};

/** Label + control + error/hint, used in every sales form grid. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
  required,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Label/value pairs for detail-page summary cards. */
export function InfoList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="font-medium">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Sticky action bar at the bottom of a create/edit form. */
export function FormActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "no-print sticky bottom-0 z-20 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Hides the app sidebar when a sales document is printed (the top bar already hides itself). */
export function PrintChrome() {
  return <style>{`@media print { [data-slot="sidebar"], [data-slot="sidebar-gap"], [data-slot="sidebar-container"] { display: none !important; } main { padding: 0 !important; } }`}</style>;
}
