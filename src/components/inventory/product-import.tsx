"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Download, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatQty, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import { importProductsAction } from "@/app/(app)/inventory/products/actions";
import { Field } from "./shared";

const COLUMNS = [
  "sku",
  "name",
  "barcode",
  "type",
  "category",
  "brand",
  "unit",
  "cost",
  "sale_price",
  "min_sale_price",
  "wholesale_price",
  "tax_rate",
  "reorder_level",
  "reorder_qty",
  "track_rolls",
  "colour",
  "size",
  "material",
  "opening_qty",
  "warehouse",
] as const;

// Accepted header spellings → field
const ALIASES: Record<string, string> = {
  sku: "sku",
  code: "sku",
  name: "name",
  product: "name",
  product_name: "name",
  barcode: "barcode",
  type: "type",
  category: "category",
  brand: "brand",
  unit: "unit",
  uom: "unit",
  cost: "cost",
  cost_price: "cost",
  sale: "sale",
  sale_price: "sale",
  price: "sale",
  min_sale: "minSale",
  min_sale_price: "minSale",
  minimum_price: "minSale",
  wholesale: "wholesale",
  wholesale_price: "wholesale",
  tax: "taxRate",
  tax_rate: "taxRate",
  reorder_level: "reorderLevel",
  reorder_qty: "reorderQty",
  track_rolls: "trackBatches",
  track_batches: "trackBatches",
  rolls: "trackBatches",
  color: "color",
  colour: "color",
  size: "size",
  material: "material",
  opening_qty: "openingQty",
  opening_stock: "openingQty",
  qty: "openingQty",
  warehouse: "openingWarehouse",
  opening_warehouse: "openingWarehouse",
};

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const truthy = (v: string) => /^(1|y|yes|true|x)$/i.test(v.trim());
const n = (v: string | undefined) => {
  const x = Number((v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(x) ? x : NaN;
};

interface ParsedRow {
  data: {
    sku: string;
    name: string;
    barcode: string;
    type: string;
    category: string;
    brand: string;
    unit: string;
    cost: number;
    sale: number;
    minSale: number;
    wholesale: number;
    taxRate: number;
    reorderLevel: number;
    reorderQty: number;
    trackBatches: boolean;
    color: string;
    size: string;
    material: string;
    openingQty: number;
    openingWarehouse: string;
  };
  errors: string[];
}

export function ProductImport({ unitCodes, warehouseCodes, canCost }: { unitCodes: string[]; warehouseCodes: string[]; canCost: boolean }) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(today());
  const [result, setResult] = useState<{ created: number; skipped: { row: number; name: string; reason: string }[]; openingValue: number } | null>(null);
  const { run, pending } = useAction();
  const units = useMemo(() => new Set(unitCodes.map((u) => u.toLowerCase())), [unitCodes]);
  const whs = useMemo(() => new Set(warehouseCodes.map((w) => w.toLowerCase())), [warehouseCodes]);

  const parsed = useMemo(() => {
    const rows = parseCsv(text);
    if (rows.length < 2) return { headers: [] as string[], unknown: [] as string[], rows: [] as ParsedRow[] };
    const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
    const fields = headers.map((h) => ALIASES[h]);
    const unknown = headers.filter((h, i) => !fields[i] && h);
    const out: ParsedRow[] = rows.slice(1).map((r) => {
      const get = (f: string) => {
        const i = fields.indexOf(f);
        return i >= 0 ? (r[i] ?? "").trim() : "";
      };
      const numField = (f: string) => {
        const raw = get(f);
        return raw === "" ? 0 : n(raw);
      };
      const data = {
        sku: get("sku"),
        name: get("name"),
        barcode: get("barcode"),
        type: get("type").toLowerCase() === "service" ? "service" : "stock",
        category: get("category"),
        brand: get("brand"),
        unit: get("unit"),
        cost: numField("cost"),
        sale: numField("sale"),
        minSale: numField("minSale"),
        wholesale: numField("wholesale"),
        taxRate: numField("taxRate"),
        reorderLevel: numField("reorderLevel"),
        reorderQty: numField("reorderQty"),
        trackBatches: truthy(get("trackBatches")),
        color: get("color"),
        size: get("size"),
        material: get("material"),
        openingQty: canCost ? numField("openingQty") : 0,
        openingWarehouse: get("openingWarehouse"),
      };
      const errors: string[] = [];
      if (!data.name) errors.push("Name is missing");
      if (!data.unit) errors.push("Unit is missing");
      else if (!units.has(data.unit.toLowerCase())) errors.push(`Unknown unit "${data.unit}"`);
      for (const k of ["cost", "sale", "minSale", "wholesale", "taxRate", "reorderLevel", "reorderQty", "openingQty"] as const) {
        if (Number.isNaN(data[k]) || data[k] < 0) errors.push(`${k} must be a number of 0 or more`);
      }
      if (data.openingWarehouse && !whs.has(data.openingWarehouse.toLowerCase())) errors.push(`Unknown warehouse "${data.openingWarehouse}"`);
      return { data, errors };
    });
    return { headers, unknown, rows: out };
  }, [text, units, whs, canCost]);

  const valid = parsed.rows.filter((r) => r.errors.length === 0);
  const openingValue = valid.reduce((t, r) => t + (r.data.type === "stock" ? r.data.openingQty * r.data.cost : 0), 0);

  const downloadTemplate = () => {
    const sample = ["", "Swiss Voile - Off White", "", "stock", "Lawn", "Alkaram", "m", "690", "1150", "980", "1035", "0", "100", "200", "yes", "Off White", "", "Voile", "50", "MAIN"];
    const blob = new Blob([[COLUMNS.join(","), sample.join(",")].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "products-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (result) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-8 text-success" />
            <div>
              <p className="text-lg font-semibold">{result.created} product(s) imported</p>
              <p className="text-sm text-muted-foreground">
                {result.openingValue > 0 ? `Opening stock of ${formatMoney(result.openingValue)} booked to Inventory. ` : ""}
                {result.skipped.length ? `${result.skipped.length} row(s) skipped.` : "No rows were skipped."}
              </p>
            </div>
          </div>
          {result.skipped.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {result.skipped.map((s) => (
                <li key={s.row} className="flex justify-between gap-3 px-3 py-2">
                  <span>
                    Row {s.row}: {s.name}
                  </span>
                  <span className="text-destructive">{s.reason}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/inventory/products">Go to products</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setText("");
              }}
            >
              Import another file
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose a CSV file</CardTitle>
          <CardDescription>
            Columns: {COLUMNS.join(", ")}. Only <strong>name</strong> and <strong>unit</strong> (a unit code such as {unitCodes.slice(0, 3).join(", ")}) are required. Missing categories
            and brands are created; rows whose SKU already exists are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <label className="cursor-pointer">
                <FileUp className="size-4" />
                Choose file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setText(await f.text());
                  }}
                />
              </label>
            </Button>
            <Button variant="ghost" onClick={downloadTemplate}>
              <Download className="size-4" />
              Download template
            </Button>
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="…or paste CSV text here" className="font-mono text-xs" />
          {canCost && (
            <Field label="Opening stock date" htmlFor="imp-date" hint="Used when rows include an opening quantity (received at the cost column)">
              <Input id="imp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </Field>
          )}
        </CardContent>
      </Card>

      {parsed.rows.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>2. Check the preview</CardTitle>
            <CardDescription>
              {valid.length} of {parsed.rows.length} row(s) ready
              {parsed.unknown.length ? ` · ignored columns: ${parsed.unknown.join(", ")}` : ""}
              {openingValue > 0 ? ` · opening stock ${formatMoney(openingValue)}` : ""}
            </CardDescription>
          </CardHeader>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Row</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Category / brand</th>
                  <th className="px-3 py-2 text-left">Unit</th>
                  {canCost && <th className="px-3 py-2 text-right">Cost</th>}
                  <th className="px-3 py-2 text-right">Sale</th>
                  {canCost && <th className="px-3 py-2 text-right">Opening</th>}
                  <th className="px-3 py-2 text-left">Check</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((r, i) => (
                  <tr key={i} className={cn("border-t", r.errors.length && "bg-destructive/5")}>
                    <td className="px-3 py-2 text-muted-foreground">{i + 2}</td>
                    <td className="px-3 py-2 font-medium">
                      {r.data.name || "—"}
                      {r.data.type === "service" && <span className="ml-2 text-xs text-muted-foreground">service</span>}
                    </td>
                    <td className="px-3 py-2 tabular">{r.data.sku || <span className="text-muted-foreground">auto</span>}</td>
                    <td className="px-3 py-2">{[r.data.category, r.data.brand].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="px-3 py-2">{r.data.unit}</td>
                    {canCost && <td className="px-3 py-2 text-right tabular">{formatMoney(r.data.cost)}</td>}
                    <td className="px-3 py-2 text-right tabular">{formatMoney(r.data.sale)}</td>
                    {canCost && (
                      <td className="px-3 py-2 text-right tabular">
                        {r.data.openingQty ? `${formatQty(r.data.openingQty)} ${r.data.openingWarehouse ? `@ ${r.data.openingWarehouse}` : ""}` : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      {r.errors.length ? (
                        <span className="flex items-center gap-1 text-destructive">
                          <TriangleAlert className="size-3.5 shrink-0" />
                          {r.errors.join("; ")}
                        </span>
                      ) : (
                        <span className="text-success">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
            {parsed.rows.length !== valid.length && <p className="mr-auto text-sm text-muted-foreground">Rows with problems will be left out.</p>}
            <Button
              disabled={pending || valid.length === 0}
              onClick={() =>
                run(() => importProductsAction({ date, rows: valid.map((r) => r.data) }), {
                  success: (d) => `${d.created} product(s) imported`,
                  onSuccess: (d) => setResult(d),
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Import {valid.length} product(s)
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
