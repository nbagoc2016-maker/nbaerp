"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatMoney, formatNumber } from "@/lib/format";

const config = { total: { label: "Spent", color: "var(--chart-1)" } } satisfies ChartConfig;

/** Horizontal bars of spend by expense category (largest first; the tail is folded into "Other"). */
export function ExpenseChart({ data }: { data: { name: string; total: number }[] }) {
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, d) => s + d.total, 0);
  const rows = rest > 0 ? [...top, { name: "Other", total: rest }] : top;
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No expenses in this period.</p>;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(140, rows.length * 38 + 30) }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNumber(v)} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={150} tick={{ fontSize: 12 }} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} formatter={(v) => formatMoney(Number(v), { fixed: true })} />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={4} barSize={20} />
      </BarChart>
    </ChartContainer>
  );
}
