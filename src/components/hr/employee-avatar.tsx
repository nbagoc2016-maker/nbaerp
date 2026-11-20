import { cn } from "@/lib/utils";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ""))).toUpperCase();
}

/** Round initials badge for an employee (no photos stored). */
export function EmployeeAvatar({ name, size = "default", className }: { name: string; size?: "sm" | "default" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        size === "sm" && "size-7 text-[11px]",
        size === "default" && "size-8 text-xs",
        size === "lg" && "size-14 text-lg",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Avatar + name + code, used in table cells. */
export function EmployeeCell({ name, code, sub }: { name: string; code?: string | null; sub?: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <EmployeeAvatar name={name} size="sm" />
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        {(sub || code) && <p className="truncate text-xs text-muted-foreground">{sub ?? code}</p>}
      </div>
    </div>
  );
}
