import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  // neutral / in progress
  draft: "bg-muted text-muted-foreground ring-border",
  pending: "bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning",
  counting: "bg-info/12 text-info ring-info/25",
  sent: "bg-info/12 text-info ring-info/25",
  approved: "bg-info/12 text-info ring-info/25",
  confirmed: "bg-info/12 text-info ring-info/25",
  open: "bg-info/12 text-info ring-info/25",
  partial: "bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning",
  unpaid: "bg-destructive/10 text-destructive ring-destructive/20",
  unbilled: "bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning",
  // done / good
  posted: "bg-success/12 text-success ring-success/25",
  paid: "bg-success/12 text-success ring-success/25",
  received: "bg-success/12 text-success ring-success/25",
  billed: "bg-success/12 text-success ring-success/25",
  fulfilled: "bg-success/12 text-success ring-success/25",
  accepted: "bg-success/12 text-success ring-success/25",
  converted: "bg-success/12 text-success ring-success/25",
  settled: "bg-success/12 text-success ring-success/25",
  active: "bg-success/12 text-success ring-success/25",
  present: "bg-success/12 text-success ring-success/25",
  closed: "bg-muted text-muted-foreground ring-border",
  // bad / stopped
  void: "bg-muted text-muted-foreground line-through ring-border",
  cancelled: "bg-muted text-muted-foreground ring-border",
  rejected: "bg-destructive/10 text-destructive ring-destructive/20",
  expired: "bg-muted text-muted-foreground ring-border",
  overdue: "bg-destructive/10 text-destructive ring-destructive/20",
  absent: "bg-destructive/10 text-destructive ring-destructive/20",
  inactive: "bg-muted text-muted-foreground ring-border",
  resigned: "bg-muted text-muted-foreground ring-border",
  terminated: "bg-destructive/10 text-destructive ring-destructive/20",
  late: "bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning",
  half_day: "bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning",
  leave: "bg-info/12 text-info ring-info/25",
  on_leave: "bg-info/12 text-info ring-info/25",
  holiday: "bg-muted text-muted-foreground ring-border",
  low: "bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning",
  out: "bg-destructive/10 text-destructive ring-destructive/20",
};

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Coloured pill for any document / record status. Unknown statuses render neutral. */
export function StatusBadge({ status, className, children }: { status: string; className?: string; children?: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STYLES[status] ?? STYLES.draft,
        className
      )}
    >
      {children ?? label(status)}
    </span>
  );
}
