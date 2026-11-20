"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Cell = string | number | null | undefined;

const esc = (v: Cell) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Downloads the given rows (first row = header) as a CSV file. */
export function ExportCsvButton({ rows, filename, label = "Export" }: { rows: Cell[][]; filename: string; label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={rows.length <= 1}
      onClick={() => {
        const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      }}
    >
      <Download className="size-4" />
      {label}
    </Button>
  );
}
