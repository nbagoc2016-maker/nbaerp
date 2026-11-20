import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

const TONES = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning-foreground dark:text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info/12 text-info",
} as const;

/** KPI tile: label, big value, optional icon, hint line and change vs previous period. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  change,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  /** Percent change vs previous period; positive is shown green unless invert is set */
  change?: { value: number; invert?: boolean; label?: string } | null;
  className?: string;
}) {
  const good = change ? (change.invert ? change.value <= 0 : change.value >= 0) : true;
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {Icon && (
            <span className={cn("flex size-8 items-center justify-center rounded-lg", TONES[tone])}>
              <Icon className="size-4" />
            </span>
          )}
        </div>
        <p className="tabular truncate text-2xl font-semibold tracking-tight">{value}</p>
        {(hint || change) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {change && (
              <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-destructive")}>
                {change.value >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(change.value).toFixed(1)}%
              </span>
            )}
            {change?.label && <span>{change.label}</span>}
            {hint && <span className="truncate">{hint}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
