"use client";

import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts";
import { BarChart3, PieChart as PieIcon, TrendingUp, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const axisMoney = (v: number) => (v === 0 ? "0" : compact.format(v));

/** Tooltip row: colour dot, series label, amount with currency. */
function moneyFormatter(config: ChartConfig) {
  function MoneyRow(value: unknown, name: unknown, item: { color?: string; payload?: { fill?: string } }) {
    const key = String(name);
    return (
      <div className="flex w-full items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.payload?.fill ?? item.color }} />
        <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
        <span className="ml-auto pl-3 font-mono font-medium tabular-nums text-foreground">{formatMoney(Number(value))}</span>
      </div>
    );
  }
  return MoneyRow;
}

function ChartEmpty({ icon: Icon, text, className }: { icon: typeof TrendingUp; text: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground", className)}>
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5" />
      </span>
      <p className="max-w-56">{text}</p>
    </div>
  );
}

interface TrendPoint {
  key: string;
  label: string;
  sales: number;
  profit: number;
}

export function SalesTrendChart({ daily, monthly, showProfit }: { daily: TrendPoint[]; monthly: TrendPoint[]; showProfit: boolean }) {
  const [range, setRange] = useState<"30d" | "12m">("30d");
  const data = range === "30d" ? daily : monthly;
  const config: ChartConfig = {
    sales: { label: "Net sales", color: "var(--chart-1)" },
    ...(showProfit ? { profit: { label: "Gross profit", color: "var(--chart-2)" } } : {}),
  };
  const totalSales = data.reduce((s, p) => s + p.sales, 0);
  const totalProfit = data.reduce((s, p) => s + p.profit, 0);
  const hasData = data.some((p) => p.sales !== 0 || p.profit !== 0);

  return (
    <Card className="h-full gap-4">
      <CardHeader>
        <CardTitle>{showProfit ? "Sales vs gross profit" : "Sales trend"}</CardTitle>
        <CardDescription>
          {range === "30d" ? "Last 30 days, daily" : "Last 12 months"} ·{" "}
          <span className="tabular font-medium text-foreground">{formatMoney(totalSales)}</span> sales
          {showProfit && (
            <>
              {" · "}
              <span className="tabular font-medium text-foreground">{formatMoney(totalProfit)}</span> profit
            </>
          )}
        </CardDescription>
        <CardAction>
          <ToggleGroup type="single" size="sm" variant="outline" value={range} onValueChange={(v) => v && setRange(v as "30d" | "12m")}>
            <ToggleGroupItem value="30d" className="px-2.5 text-xs">
              30 days
            </ToggleGroupItem>
            <ToggleGroupItem value="12m" className="px-2.5 text-xs">
              12 months
            </ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {hasData ? (
          <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
            <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={axisMoney} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" formatter={moneyFormatter(config)} />} />
              <Area dataKey="sales" type="monotone" stroke="var(--color-sales)" strokeWidth={2} fill="url(#fillSales)" />
              {showProfit && <Area dataKey="profit" type="monotone" stroke="var(--color-profit)" strokeWidth={2} fill="url(#fillProfit)" />}
              {showProfit && <ChartLegend content={<ChartLegendContent />} />}
            </AreaChart>
          </ChartContainer>
        ) : (
          <ChartEmpty icon={TrendingUp} text="No posted sales in this period yet. Your trend appears here once invoices are posted." className="h-[260px]" />
        )}
      </CardContent>
    </Card>
  );
}

export function CategoryDonut({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const slots = data.map((d, i) => ({ ...d, slot: `c${i}`, fill: `var(--chart-${(i % 5) + 1})` }));
  const config: ChartConfig = Object.fromEntries(slots.map((d) => [d.slot, { label: d.name, color: d.fill }]));

  return (
    <Card className="h-full gap-4">
      <CardHeader>
        <CardTitle>Sales by category</CardTitle>
        <CardDescription>Last 30 days, net of returns</CardDescription>
      </CardHeader>
      <CardContent>
        {total > 0 ? (
          <div className="flex flex-col items-center gap-4">
            <ChartContainer config={config} className="aspect-square h-[180px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="slot" formatter={moneyFormatter(config)} />} />
                <Pie data={slots} dataKey="value" nameKey="slot" innerRadius={56} outerRadius={84} strokeWidth={2} paddingAngle={slots.length > 1 ? 2 : 0}>
                  {slots.map((d) => (
                    <Cell key={d.slot} fill={d.fill} className="stroke-card" />
                  ))}
                  <Label
                    content={({ viewBox }) =>
                      viewBox && "cx" in viewBox && "cy" in viewBox ? (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 6} className="fill-foreground text-base font-semibold tabular-nums">
                            {compact.format(total)}
                          </tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 12} className="fill-muted-foreground text-[11px]">
                            total
                          </tspan>
                        </text>
                      ) : null
                    }
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            <ul className="w-full space-y-1.5 text-sm">
              {slots.map((d) => (
                <li key={d.slot} className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: d.fill }} />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="tabular text-muted-foreground">{total ? Math.round((d.value / total) * 100) : 0}%</span>
                  <span className="tabular min-w-24 shrink-0 whitespace-nowrap text-right font-medium">{formatMoney(Math.round(d.value))}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ChartEmpty icon={PieIcon} text="Category split shows once products with categories are sold." className="h-[260px]" />
        )}
      </CardContent>
    </Card>
  );
}

export function TopProductsChart({ data }: { data: { name: string; value: number; qty: number }[] }) {
  const config: ChartConfig = { value: { label: "Revenue", color: "var(--chart-1)" } };
  const short = data.map((d) => ({ ...d, short: d.name.length > 18 ? `${d.name.slice(0, 17)}…` : d.name }));
  return (
    <Card className="h-full gap-4">
      <CardHeader>
        <CardTitle>Top products</CardTitle>
        <CardDescription>By revenue, last 30 days</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {data.length ? (
          <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
            <BarChart data={short} layout="vertical" margin={{ left: 0, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" dataKey="value" tickLine={false} axisLine={false} tickFormatter={axisMoney} />
              <YAxis type="category" dataKey="short" tickLine={false} axisLine={false} width={120} />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent labelFormatter={(_, p) => (p?.[0]?.payload as { name?: string })?.name ?? ""} formatter={moneyFormatter(config)} />}
              />
              <Bar dataKey="value" fill="var(--color-value)" radius={[0, 6, 6, 0]} maxBarSize={28} />
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartEmpty icon={BarChart3} text="Your best sellers appear here after the first sales." className="h-[240px]" />
        )}
      </CardContent>
    </Card>
  );
}

export function CashFlowChart({ data }: { data: { key: string; label: string; in: number; out: number }[] }) {
  const config: ChartConfig = {
    in: { label: "Money in", color: "var(--chart-2)" },
    out: { label: "Money out", color: "var(--chart-5)" },
  };
  const hasData = data.some((d) => d.in || d.out);
  const net = data.reduce((s, d) => s + d.in - d.out, 0);
  return (
    <Card className="h-full gap-4">
      <CardHeader>
        <CardTitle>Cash in vs out</CardTitle>
        <CardDescription>
          Cash, bank & petty cash, last 6 months · net{" "}
          <span className={cn("tabular font-medium", net < 0 ? "text-destructive" : "text-success")}>{formatMoney(net)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {hasData ? (
          <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
            <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={axisMoney} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" formatter={moneyFormatter(config)} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="in" fill="var(--color-in)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="out" fill="var(--color-out)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartEmpty icon={Wallet} text="Receipts and payments through cash and bank accounts show here." className="h-[240px]" />
        )}
      </CardContent>
    </Card>
  );
}
