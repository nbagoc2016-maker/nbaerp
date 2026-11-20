"use client";

import { useState } from "react";
import { Check, Hash, Loader2, Lock, LockOpen, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfirmButton } from "@/components/app/confirm-button";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveLockDate, saveNumberSeries } from "@/app/(app)/settings/company/actions";

export interface SeriesValue {
  key: string;
  label: string;
  prefix: string;
  nextNumber: number;
  padding: number;
  inUse: boolean;
}

const preview = (s: { prefix: string; nextNumber: number; padding: number }) =>
  `${s.prefix}${String(Math.max(Number(s.nextNumber) || 0, 0)).padStart(Math.min(Math.max(Number(s.padding) || 0, 0), 10), "0")}`;

function SeriesRow({ initial, canEdit }: { initial: SeriesValue; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const { run, pending, fieldErrors } = useAction();
  const dirty = v.prefix !== initial.prefix || Number(v.nextNumber) !== initial.nextNumber || Number(v.padding) !== initial.padding;

  return (
    <TableRow>
      <TableCell className="min-w-40">
        <p className="font-medium">{initial.label}</p>
        <p className="text-xs text-muted-foreground">{initial.inUse ? `Key ${initial.key}` : "Not used yet"}</p>
      </TableCell>
      <TableCell>
        <Input value={v.prefix} onChange={(e) => setV({ ...v, prefix: e.target.value.replace(/\s/g, "") })} disabled={!canEdit} className="h-8 w-28 font-mono" aria-label={`${initial.label} prefix`} />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          value={v.nextNumber}
          onChange={(e) => setV({ ...v, nextNumber: Number(e.target.value) })}
          disabled={!canEdit}
          className={cn("h-8 w-28 text-right tabular", fieldErrors.nextNumber && "border-destructive")}
          aria-label={`${initial.label} next number`}
          title={fieldErrors.nextNumber}
        />
      </TableCell>
      <TableCell>
        <Input type="number" min={1} max={10} value={v.padding} onChange={(e) => setV({ ...v, padding: Number(e.target.value) })} disabled={!canEdit} className="h-8 w-20 text-right tabular" aria-label={`${initial.label} digits`} />
      </TableCell>
      <TableCell>
        <code className={cn("rounded-md bg-muted px-2 py-1 font-mono text-xs whitespace-nowrap", dirty && "bg-primary/10 text-primary")}>{preview(v)}</code>
      </TableCell>
      {canEdit && (
        <TableCell className="text-right whitespace-nowrap">
          {dirty && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setV(initial)} disabled={pending} aria-label="Undo">
              <RotateCcw className="size-4" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant={dirty ? "default" : "outline"}
            disabled={!dirty || pending}
            onClick={() => run(() => saveNumberSeries({ key: v.key, prefix: v.prefix, nextNumber: Number(v.nextNumber), padding: Number(v.padding) }), { success: `${initial.label}: next number is ${preview(v)}` })}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

export function NumberingCard({ series, canEdit }: { series: SeriesValue[]; canEdit: boolean }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hash className="size-4 text-muted-foreground" /> Document numbering
        </CardTitle>
        <CardDescription>
          Prefix, next number and digits for every document type. A series can&apos;t go backwards with the same prefix, so numbers are never reused.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6 text-xs font-semibold uppercase tracking-wide">Document</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Prefix</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Next number</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Digits</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Next will be</TableHead>
                {canEdit && <TableHead className="pr-6" />}
              </TableRow>
            </TableHeader>
            <TableBody className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6">
              {series.map((s) => (
                <SeriesRow key={`${s.key}:${s.prefix}:${s.nextNumber}:${s.padding}`} initial={s} canEdit={canEdit} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function LockDateCard({ lockDate, canEdit, today }: { lockDate: string | null; canEdit: boolean; today: string }) {
  const [date, setDate] = useState(lockDate ?? "");
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {lockDate ? <Lock className="size-4 text-warning" /> : <LockOpen className="size-4 text-muted-foreground" />} Close books
        </CardTitle>
        <CardDescription>
          Once a period is closed, nothing dated on or before the lock date can be posted, voided or changed. Use it after month-end or year-end when the numbers have been
          checked and reported.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("rounded-lg border px-4 py-3 text-sm", lockDate ? "border-warning/40 bg-warning/10" : "bg-muted/40")}>
          {lockDate ? (
            <>
              Books are closed up to <span className="font-semibold">{formatDate(lockDate, "long")}</span>. Postings must be dated after it.
            </>
          ) : (
            "Books are open: documents can be posted on any date."
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="lock-date" className="mb-1.5">
                Lock date
              </Label>
              <Input id="lock-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
            </div>
            <ConfirmButton
              size="default"
              disabled={!valid || date === lockDate}
              title={`Close the books up to ${valid ? formatDate(date, "long") : "this date"}?`}
              description="Nobody will be able to post, void or edit anything dated on or before this day until the books are reopened."
              confirmLabel="Close books"
              success="Books closed"
              onConfirm={() => saveLockDate({ lockDate: date })}
            >
              <Lock className="size-4" /> Close books
            </ConfirmButton>
            {lockDate && (
              <ConfirmButton
                size="default"
                variant="outline"
                title="Reopen all periods?"
                description="This removes the lock date, so earlier periods can be changed again. The change is recorded in the audit log."
                confirmLabel="Reopen"
                success="Books reopened"
                onConfirm={async () => {
                  const res = await saveLockDate({ lockDate: null });
                  if (res.ok) setDate("");
                  return res;
                }}
              >
                <LockOpen className="size-4" /> Reopen
              </ConfirmButton>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
