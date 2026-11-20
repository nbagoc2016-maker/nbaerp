import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Formatted amount with tabular digits. `signed` colours positives green and negatives red. */
export function Money({
  value,
  fixed,
  signed,
  muteZero,
  className,
}: {
  value: number | null | undefined;
  fixed?: boolean;
  signed?: boolean;
  muteZero?: boolean;
  className?: string;
}) {
  const n = Number(value ?? 0);
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        signed && n > 0 && "text-success",
        (signed || n < 0) && n < 0 && "text-destructive",
        muteZero && n === 0 && "text-muted-foreground",
        className
      )}
    >
      {muteZero && n === 0 ? "—" : formatMoney(n, { fixed })}
    </span>
  );
}
