"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { JournalListRow } from "@/server/queries/accounting";
import { SOURCE_LABELS } from "@/server/services/finance-shared";
import { SourceLink } from "./source-link";

const columns: ColumnDef<JournalListRow, unknown>[] = [
  {
    accessorKey: "number",
    header: "Number",
    cell: ({ row }) => (
      <Link href={`/accounting/journals/${row.original.id}`} className="font-medium text-primary hover:underline">
        {row.original.number}
      </Link>
    ),
  },
  { accessorKey: "date", header: "Date", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span> },
  { accessorKey: "memo", header: "Memo", cell: ({ row }) => <span className="line-clamp-1 max-w-80">{row.original.memo ?? "—"}</span> },
  {
    id: "source",
    accessorFn: (r) => `${SOURCE_LABELS[r.sourceType]} ${r.sourceNumber ?? ""}`,
    header: "Source",
    cell: ({ row }) => <SourceLink sourceType={row.original.sourceType} sourceId={row.original.sourceId} sourceNumber={row.original.sourceNumber} />,
  },
  { accessorKey: "total", header: "Total", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.total} fixed /> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
];

export function JournalsTable({ data, canPost, toolbar }: { data: JournalListRow[]; canPost: boolean; toolbar?: React.ReactNode }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      toolbar={toolbar}
      searchPlaceholder="Search number, memo, source…"
      exportName="journal-entries"
      rowHref={(r) => `/accounting/journals/${r.id}`}
      emptyTitle="No journal entries in this period"
      emptyDescription="Every sale, purchase, payment and expense posts a journal here automatically. Use a manual journal for adjustments, accruals and corrections."
      emptyAction={
        canPost ? (
          <Button asChild size="sm">
            <Link href="/accounting/journals/new">
              <Plus className="size-4" />
              New journal entry
            </Link>
          </Button>
        ) : undefined
      }
    />
  );
}
