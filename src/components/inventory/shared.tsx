// Small presentational pieces shared by the inventory screens (usable from server and client).
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";
import { Label } from "@/components/ui/label";

export type StockState = "in" | "low" | "out";

/** Out when nothing is left, low when at or under the reorder level. */
export function stockState(qty: number, reorderLevel: number): StockState {
  if (qty <= 0.0005) return "out";
  if (reorderLevel > 0 && qty <= reorderLevel) return "low";
  return "in";
}

export function StockBadge({ qty, reorderLevel, className }: { qty: number; reorderLevel: number; className?: string }) {
  const state = stockState(qty, reorderLevel);
  if (state === "out") return <StatusBadge status="out" className={className}>Out of stock</StatusBadge>;
  if (state === "low") return <StatusBadge status="low" className={className}>Low stock</StatusBadge>;
  return <StatusBadge status="active" className={className}>In stock</StatusBadge>;
}

const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Product thumbnail, or its initials on a tinted tile when there is no image. */
export function ProductAvatar({ name, imageUrl, size = "md" }: { name: string; imageUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "size-14 text-lg" : size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs";
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className={cn("shrink-0 rounded-lg border object-cover", dim)} />;
  }
  return <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary", dim)}>{initials(name) || "?"}</span>;
}

/** Label + control + error message, for form grids. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Thin progress bar coloured by how much is left. */
export function RemainingBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn("h-full rounded-full transition-all", pct <= 0 ? "bg-muted-foreground/30" : pct < 20 ? "bg-destructive" : pct < 50 ? "bg-warning" : "bg-success")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export const WAREHOUSE_TYPES = { warehouse: "Warehouse", shop: "Shop", transit: "In transit", distribution: "Distribution", production_hall: "Production Hall", gate_area: "Gate Area", dispatch_area: "Dispatch" } as const;

export const ADJUSTMENT_REASON_LABELS: Record<string, string> = {
  damage: "Damaged",
  loss: "Lost / theft",
  found: "Found",
  correction: "Correction",
  sample: "Sample / giveaway",
  opening: "Opening stock",
  other: "Other",
};
