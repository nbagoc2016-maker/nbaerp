"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileClock, PanelRightOpen } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/app/data-table";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AuditRow } from "@/server/queries/admin-core";
import { humanize } from "./humanize";

const ACTION_TONES: Record<string, string> = {
  create: "bg-success/12 text-success ring-success/25",
  post: "bg-success/12 text-success ring-success/25",
  update: "bg-info/12 text-info ring-info/25",
  login: "bg-muted text-muted-foreground ring-border",
  logout: "bg-muted text-muted-foreground ring-border",
  void: "bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning",
  lock: "bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning",
  unlock: "bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning",
  delete: "bg-destructive/10 text-destructive ring-destructive/20",
};

export function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        ACTION_TONES[action] ?? "bg-muted text-muted-foreground ring-border"
      )}
    >
      {humanize(action)}
    </span>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [open, setOpen] = useState<AuditRow | null>(null);
  const columns: ColumnDef<AuditRow, unknown>[] = [
    {
      accessorKey: "createdAt",
      header: "Time",
      cell: ({ getValue }) => <span className="tabular whitespace-nowrap text-muted-foreground">{formatDateTime(String(getValue()))}</span>,
      meta: { csv: (r: unknown) => formatDateTime((r as AuditRow).createdAt) },
    },
    { accessorKey: "userName", header: "User", cell: ({ getValue }) => <span className="whitespace-nowrap font-medium">{String(getValue())}</span> },
    { accessorKey: "action", header: "Action", cell: ({ getValue }) => <ActionBadge action={String(getValue())} /> },
    { accessorKey: "entity", header: "Record", cell: ({ getValue }) => <span className="whitespace-nowrap">{humanize(String(getValue()))}</span> },
    { accessorKey: "summary", header: "Summary", cell: ({ getValue }) => <span className="line-clamp-2 min-w-64">{String(getValue())}</span> },
    {
      id: "actions",
      header: "",
      meta: { align: "right" },
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => setOpen(row.original)}>
          <PanelRightOpen className="size-4" />
          <span className="sr-only sm:not-sr-only">Details</span>
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        exportName="audit-log"
        pageSize={50}
        searchPlaceholder="Search summaries, users…"
        emptyTitle="No activity found"
        emptyDescription="Nothing was recorded for these filters. Try a wider date range."
      />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileClock className="size-4 text-muted-foreground" /> {humanize(open.entity)} · {humanize(open.action)}
                </SheetTitle>
                <SheetDescription>{open.summary}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <dl className="divide-y rounded-lg border px-3">
                  <Detail label="When">{formatDateTime(open.createdAt)}</Detail>
                  <Detail label="User">{open.userName}</Detail>
                  <Detail label="Action">
                    <ActionBadge action={open.action} />
                  </Detail>
                  <Detail label="Record">{humanize(open.entity)}</Detail>
                  <Detail label="Record ID">
                    <code className="font-mono text-xs">{open.entityId ?? "—"}</code>
                  </Detail>
                </dl>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Data</p>
                  {open.data == null ? (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No extra data was recorded for this entry.</p>
                  ) : (
                    <pre className="max-h-[50vh] overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">{JSON.stringify(open.data, null, 2)}</pre>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
