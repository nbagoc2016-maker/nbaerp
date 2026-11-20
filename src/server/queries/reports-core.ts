// Business reports. Every function takes a db handle so scripts/tests can run them against an
// in-memory database; the app calls them through ./reports.ts (server-only, app db bound).
// Only posted documents count (never draft or void), and GL figures use posted journals only.
import { sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { parseDay, round2, round3 } from "@/lib/format";

export interface Period {
  from: string;
  to: string;
}

// ---- helpers ----------------------------------------------------------------------------------

export async function rows<T>(db: DbOrTx, query: SQL): Promise<T[]> {
  const res = (await db.execute(query)) as unknown as Record<string, unknown> | unknown[];
  // postgres.js returns an array directly (res), whereas pglite / neon returns an object with a .rows array (res.rows)
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === "object" && "rows" in res && Array.isArray(res.rows)) return res.rows as T[];
  return [];
}

/** Numeric from the driver (strings for numeric columns) → finite JS number. */
export const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** a as a percent of b, 0 when b is 0 (never NaN / Infinity). */
export const pct = (a: number, b: number) => (b ? round2((a / b) * 100) : 0);

/** Percent change from prev to cur, or null when there is nothing to compare with. */
export const change = (cur: number, prev: number): number | null => (prev ? round2(((cur - prev) / Math.abs(prev)) * 100) : null);

export function daysBetween(from: string, to: string) {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

const CASH_SUBTYPES = sql.raw(`('cash','bank','petty_cash')`);

/** Journal entries whose lines are all cash/bank/petty cash accounts (internal transfers, top-ups). */
const internalCashEntries = sql`(select jl.entry_id from journal_lines jl join accounts a2 on a2.id = jl.account_id
  group by jl.entry_id having bool_and(coalesce(a2.subtype in ${CASH_SUBTYPES}, false)))`;

const postedEntry = sql`l.entry_id in (select id from journal_entries where status = 'posted')`;

function sumBy<T>(list: T[], pick: (r: T) => number) {
  return round2(list.reduce((s, r) => s + pick(r), 0));
}

// ---- Sales ------------------------------------------------------------------------------------

export interface SalesSummaryRow {
  period: string;
  invoices: number;
  gross: number;
  discounts: number;
  net: number;
  tax: number;
  charges: number;
  total: number;
  returns: number;
  netAfterReturns: number;
}

export async function salesSummary(db: DbOrTx, p: Period & { group?: "day" | "month" }) {
  const key = sql.raw(p.group === "month" ? "substr(date, 1, 7)" : "date");
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select k, sum(invoices) invoices, sum(gross) gross, sum(discounts) discounts, sum(net) net, sum(tax) tax,
          sum(charges) charges, sum(total) total, sum(returns) returns
        from (
          select ${key} k, 1 invoices, subtotal gross, discount_total discounts, subtotal - discount_total net, tax_total tax,
                 shipping_charges + round_off charges, total, 0 returns
            from sales_invoices where status = 'posted' and date between ${p.from} and ${p.to}
          union all
          select ${key} k, 0, 0, 0, 0, 0, 0, 0, subtotal - discount_total
            from sales_returns where status = 'posted' and date between ${p.from} and ${p.to}
        ) t group by k order by k`
  );
  const list: SalesSummaryRow[] = data.map((r) => {
    const net = round2(n(r.net));
    const returns = round2(n(r.returns));
    return {
      period: String(r.k),
      invoices: n(r.invoices),
      gross: round2(n(r.gross)),
      discounts: round2(n(r.discounts)),
      net,
      tax: round2(n(r.tax)),
      charges: round2(n(r.charges)),
      total: round2(n(r.total)),
      returns,
      netAfterReturns: round2(net - returns),
    };
  });
  const totals = {
    invoices: list.reduce((s, r) => s + r.invoices, 0),
    gross: sumBy(list, (r) => r.gross),
    discounts: sumBy(list, (r) => r.discounts),
    net: sumBy(list, (r) => r.net),
    tax: sumBy(list, (r) => r.tax),
    charges: sumBy(list, (r) => r.charges),
    total: sumBy(list, (r) => r.total),
    returns: sumBy(list, (r) => r.returns),
    netAfterReturns: sumBy(list, (r) => r.netAfterReturns),
  };
  return { rows: list, totals, average: totals.invoices ? round2(totals.net / totals.invoices) : 0 };
}

/** Invoice and return lines in the period as one signed stream (returns negative). */
const salesLines = (p: Period) => sql`(
  select l.product_id, l.description, l.qty sold, 0 returned, l.line_total - l.tax_amount revenue, l.qty * l.unit_cost cost, i.id doc_id
    from sales_invoice_lines l join sales_invoices i on i.id = l.invoice_id
   where i.status = 'posted' and i.date between ${p.from} and ${p.to}
  union all
  select l.product_id, l.description, 0, l.qty, -(l.line_total - l.tax_amount), -(l.qty * l.unit_cost), null
    from sales_return_lines l join sales_returns r on r.id = l.return_id
   where r.status = 'posted' and r.date between ${p.from} and ${p.to}
)`;

export interface SalesByProductRow {
  key: string;
  productId: string | null;
  sku: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  returnedQty: number;
  netQty: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

export async function salesByProduct(db: DbOrTx, p: Period) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select t.product_id, max(p.sku) sku, coalesce(max(p.name), max(t.description), 'Other items') name,
          coalesce(max(c.name), 'Uncategorised') category, coalesce(max(u.code), '') unit,
          sum(t.sold) sold, sum(t.returned) returned, sum(t.revenue) revenue, sum(t.cost) cost
        from ${salesLines(p)} t
        left join products p on p.id = t.product_id
        left join product_categories c on c.id = p.category_id
        left join units u on u.id = p.unit_id
        group by t.product_id
        order by sum(t.revenue) desc`
  );
  const list: SalesByProductRow[] = data.map((r) => {
    const revenue = round2(n(r.revenue));
    const cost = round2(n(r.cost));
    const qty = round3(n(r.sold));
    const returnedQty = round3(n(r.returned));
    return {
      key: (r.product_id as string | null) ?? "other",
      productId: (r.product_id as string | null) ?? null,
      sku: (r.sku as string | null) ?? "—",
      name: String(r.name),
      category: String(r.category),
      unit: String(r.unit ?? ""),
      qty,
      returnedQty,
      netQty: round3(qty - returnedQty),
      revenue,
      cost,
      profit: round2(revenue - cost),
      margin: pct(revenue - cost, revenue),
    };
  });
  const revenue = sumBy(list, (r) => r.revenue);
  const cost = sumBy(list, (r) => r.cost);
  return { rows: list, totals: { revenue, cost, profit: round2(revenue - cost), margin: pct(revenue - cost, revenue), products: list.length } };
}

export interface SalesByCategoryRow {
  key: string;
  name: string;
  products: number;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  share: number;
}

export async function salesByCategory(db: DbOrTx, p: Period) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select p.category_id, coalesce(max(c.name), 'Uncategorised') name, count(distinct t.product_id) products,
          sum(t.sold - t.returned) qty, sum(t.revenue) revenue, sum(t.cost) cost
        from ${salesLines(p)} t
        left join products p on p.id = t.product_id
        left join product_categories c on c.id = p.category_id
        group by p.category_id
        order by sum(t.revenue) desc`
  );
  const total = round2(data.reduce((s, r) => s + n(r.revenue), 0));
  const list: SalesByCategoryRow[] = data.map((r) => {
    const revenue = round2(n(r.revenue));
    const cost = round2(n(r.cost));
    return {
      key: (r.category_id as string | null) ?? "none",
      name: String(r.name),
      products: n(r.products),
      qty: round3(n(r.qty)),
      revenue,
      cost,
      profit: round2(revenue - cost),
      margin: pct(revenue - cost, revenue),
      share: pct(revenue, total),
    };
  });
  const cost = sumBy(list, (r) => r.cost);
  return { rows: list, totals: { revenue: total, cost, profit: round2(total - cost), margin: pct(total - cost, total), categories: list.length } };
}

export interface SalesByCustomerRow {
  key: string;
  customerId: string | null;
  code: string;
  name: string;
  invoices: number;
  net: number;
  tax: number;
  total: number;
  returns: number;
  netAfterReturns: number;
  outstanding: number;
}

export async function salesByCustomer(db: DbOrTx, p: Period) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select t.customer_id, max(c.code) code,
          case when t.customer_id is null then 'Walk-in customers' else coalesce(max(c.name), max(t.name)) end name,
          sum(t.invoices) invoices, sum(t.net) net, sum(t.tax) tax, sum(t.total) total, sum(t.returns) returns, sum(t.outstanding) outstanding
        from (
          select customer_id, customer_name name, 1 invoices, subtotal - discount_total net, tax_total tax, total, 0 returns,
                 greatest(total - amount_paid, 0) outstanding
            from sales_invoices where status = 'posted' and date between ${p.from} and ${p.to}
          union all
          select customer_id, customer_name, 0, 0, 0, 0, subtotal - discount_total, 0
            from sales_returns where status = 'posted' and date between ${p.from} and ${p.to}
        ) t left join customers c on c.id = t.customer_id
        group by t.customer_id
        order by sum(t.net) desc`
  );
  const list: SalesByCustomerRow[] = data.map((r) => {
    const net = round2(n(r.net));
    const returns = round2(n(r.returns));
    return {
      key: (r.customer_id as string | null) ?? "walk-in",
      customerId: (r.customer_id as string | null) ?? null,
      code: (r.code as string | null) ?? "—",
      name: String(r.name),
      invoices: n(r.invoices),
      net,
      tax: round2(n(r.tax)),
      total: round2(n(r.total)),
      returns,
      netAfterReturns: round2(net - returns),
      outstanding: round2(n(r.outstanding)),
    };
  });
  return {
    rows: list,
    totals: {
      customers: list.length,
      invoices: list.reduce((s, r) => s + r.invoices, 0),
      net: sumBy(list, (r) => r.net),
      tax: sumBy(list, (r) => r.tax),
      total: sumBy(list, (r) => r.total),
      returns: sumBy(list, (r) => r.returns),
      netAfterReturns: sumBy(list, (r) => r.netAfterReturns),
      outstanding: sumBy(list, (r) => r.outstanding),
    },
  };
}

export interface SalesBySalespersonRow {
  name: string;
  invoices: number;
  net: number;
  returns: number;
  netAfterReturns: number;
  cost: number;
  profit: number;
  margin: number;
  average: number;
  share: number;
}

export async function salesBySalesperson(db: DbOrTx, p: Period) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select k, sum(invoices) invoices, sum(net) net, sum(returns) returns, sum(cost) cost from (
          select coalesce(nullif(trim(salesperson), ''), 'Unassigned') k, 1 invoices, subtotal - discount_total net, 0 returns, cost_total cost
            from sales_invoices where status = 'posted' and date between ${p.from} and ${p.to}
          union all
          select coalesce(nullif(trim(i.salesperson), ''), 'Unassigned'), 0, 0, r.subtotal - r.discount_total, -r.cost_total
            from sales_returns r left join sales_invoices i on i.id = r.invoice_id
           where r.status = 'posted' and r.date between ${p.from} and ${p.to}
        ) t group by k order by sum(net) - sum(returns) desc`
  );
  const totalNet = round2(data.reduce((s, r) => s + n(r.net) - n(r.returns), 0));
  const list: SalesBySalespersonRow[] = data.map((r) => {
    const net = round2(n(r.net));
    const returns = round2(n(r.returns));
    const after = round2(net - returns);
    const cost = round2(n(r.cost));
    const invoices = n(r.invoices);
    return {
      name: String(r.k),
      invoices,
      net,
      returns,
      netAfterReturns: after,
      cost,
      profit: round2(after - cost),
      margin: pct(after - cost, after),
      average: invoices ? round2(net / invoices) : 0,
      share: pct(after, totalNet),
    };
  });
  const cost = sumBy(list, (r) => r.cost);
  return {
    rows: list,
    totals: {
      people: list.filter((r) => r.name !== "Unassigned").length,
      invoices: list.reduce((s, r) => s + r.invoices, 0),
      net: sumBy(list, (r) => r.net),
      returns: sumBy(list, (r) => r.returns),
      netAfterReturns: totalNet,
      cost,
      profit: round2(totalNet - cost),
    },
  };
}

// ---- Purchasing -------------------------------------------------------------------------------

export interface PurchasesBySupplierRow {
  supplierId: string;
  code: string;
  name: string;
  bills: number;
  net: number;
  tax: number;
  freight: number;
  total: number;
  returns: number;
  netAfterReturns: number;
  outstanding: number;
}

export async function purchasesBySupplier(db: DbOrTx, p: Period) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select t.supplier_id, max(s.code) code, coalesce(max(s.name), 'Unknown supplier') name,
          sum(bills) bills, sum(net) net, sum(tax) tax, sum(freight) freight, sum(total) total, sum(returns) returns, sum(outstanding) outstanding
        from (
          select supplier_id, 1 bills, subtotal - discount_total net, tax_total tax, freight_charges freight, total, 0 returns,
                 greatest(total - amount_paid, 0) outstanding
            from supplier_bills where status = 'posted' and date between ${p.from} and ${p.to}
          union all
          select supplier_id, 0, 0, 0, 0, 0, total, 0
            from purchase_returns where status = 'posted' and date between ${p.from} and ${p.to}
        ) t left join suppliers s on s.id = t.supplier_id
        group by t.supplier_id
        order by sum(total) desc`
  );
  const list: PurchasesBySupplierRow[] = data.map((r) => {
    const total = round2(n(r.total));
    const returns = round2(n(r.returns));
    return {
      supplierId: String(r.supplier_id),
      code: (r.code as string | null) ?? "—",
      name: String(r.name),
      bills: n(r.bills),
      net: round2(n(r.net)),
      tax: round2(n(r.tax)),
      freight: round2(n(r.freight)),
      total,
      returns,
      netAfterReturns: round2(total - returns),
      outstanding: round2(n(r.outstanding)),
    };
  });
  return {
    rows: list,
    totals: {
      suppliers: list.length,
      bills: list.reduce((s, r) => s + r.bills, 0),
      net: sumBy(list, (r) => r.net),
      tax: sumBy(list, (r) => r.tax),
      freight: sumBy(list, (r) => r.freight),
      total: sumBy(list, (r) => r.total),
      returns: sumBy(list, (r) => r.returns),
      netAfterReturns: sumBy(list, (r) => r.netAfterReturns),
      outstanding: sumBy(list, (r) => r.outstanding),
    },
  };
}

export interface PurchasesByProductRow {
  key: string;
  productId: string | null;
  sku: string;
  name: string;
  unit: string;
  bills: number;
  qty: number;
  returnedQty: number;
  value: number;
  avgCost: number;
}

export async function purchasesByProduct(db: DbOrTx, p: Period) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select t.product_id, max(p.sku) sku, coalesce(max(p.name), max(t.description), 'Services & other') name, coalesce(max(u.code), '') unit,
          count(distinct t.doc_id) bills, sum(t.qty) qty, sum(t.returned) returned, sum(t.value) value
        from (
          select l.product_id, l.description, l.qty, 0 returned, l.line_total - l.tax_amount value, b.id doc_id
            from supplier_bill_lines l join supplier_bills b on b.id = l.bill_id
           where b.status = 'posted' and b.date between ${p.from} and ${p.to}
          union all
          select l.product_id, l.description, 0, l.qty, -(l.line_total - l.tax_amount), null
            from purchase_return_lines l join purchase_returns r on r.id = l.return_id
           where r.status = 'posted' and r.date between ${p.from} and ${p.to}
        ) t
        left join products p on p.id = t.product_id
        left join units u on u.id = p.unit_id
        group by t.product_id
        order by sum(t.value) desc`
  );
  const list: PurchasesByProductRow[] = data.map((r) => {
    const qty = round3(n(r.qty));
    const returnedQty = round3(n(r.returned));
    const value = round2(n(r.value));
    const netQty = qty - returnedQty;
    return {
      key: (r.product_id as string | null) ?? "other",
      productId: (r.product_id as string | null) ?? null,
      sku: (r.sku as string | null) ?? "—",
      name: String(r.name),
      unit: String(r.unit ?? ""),
      bills: n(r.bills),
      qty,
      returnedQty,
      value,
      avgCost: netQty ? round2(value / netQty) : 0,
    };
  });
  return { rows: list, totals: { products: list.length, value: sumBy(list, (r) => r.value) } };
}

// ---- Inventory --------------------------------------------------------------------------------

export interface ValuationItem {
  key: string;
  productId: string;
  sku: string;
  name: string;
  category: string;
  warehouseId: string;
  warehouse: string;
  unit: string;
  qty: number;
  avgCost: number;
  value: number;
}
export interface ValuationGroup {
  key: string;
  name: string;
  products: number;
  qty: number;
  value: number;
  share: number;
}

export async function inventoryValuation(db: DbOrTx, opts: { warehouseId?: string | null } = {}) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select b.product_id, p.sku, p.name, coalesce(c.name, 'Uncategorised') category, w.id warehouse_id, w.name warehouse,
          coalesce(u.code, '') unit, b.qty, b.avg_cost
        from stock_balances b
        join products p on p.id = b.product_id
        join warehouses w on w.id = b.warehouse_id
        left join product_categories c on c.id = p.category_id
        left join units u on u.id = p.unit_id
        where b.qty <> 0 ${opts.warehouseId ? sql`and b.warehouse_id = ${opts.warehouseId}` : sql``}
        order by p.name, w.name`
  );
  const items: ValuationItem[] = data.map((r) => {
    const qty = round3(n(r.qty));
    const avgCost = round2(n(r.avg_cost));
    return {
      key: `${r.product_id}:${r.warehouse_id}`,
      productId: String(r.product_id),
      sku: String(r.sku),
      name: String(r.name),
      category: String(r.category),
      warehouseId: String(r.warehouse_id),
      warehouse: String(r.warehouse),
      unit: String(r.unit),
      qty,
      avgCost,
      value: round2(qty * avgCost),
    };
  });
  const total = sumBy(items, (r) => r.value);
  const group = (pick: (r: ValuationItem) => string): ValuationGroup[] => {
    const map = new Map<string, { products: Set<string>; qty: number; value: number }>();
    for (const it of items) {
      const k = pick(it);
      const g = map.get(k) ?? { products: new Set<string>(), qty: 0, value: 0 };
      g.products.add(it.productId);
      g.qty += it.qty;
      g.value += it.value;
      map.set(k, g);
    }
    return [...map.entries()]
      .map(([k, g]) => ({ key: k, name: k, products: g.products.size, qty: round3(g.qty), value: round2(g.value), share: pct(g.value, total) }))
      .sort((a, b) => b.value - a.value);
  };
  return {
    items,
    byWarehouse: group((r) => r.warehouse),
    byCategory: group((r) => r.category),
    totals: { value: total, products: new Set(items.map((i) => i.productId)).size, lines: items.length },
  };
}

export interface ReorderRow {
  productId: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  onHand: number;
  reorderLevel: number;
  reorderQty: number;
  onOrder: number;
  suggested: number;
  lastCost: number;
  estimatedCost: number;
  status: "out" | "low";
}

/** Active stock products at or below their reorder level, with a suggested order quantity. */
export async function reorderReport(db: DbOrTx) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select p.id, p.sku, p.name, coalesce(c.name, 'Uncategorised') category, coalesce(u.code, '') unit,
          p.reorder_level, p.reorder_qty, p.cost_price,
          coalesce((select sum(b.qty) from stock_balances b where b.product_id = p.id), 0) on_hand,
          coalesce((select sum(greatest(l.qty - l.received_qty, 0)) from purchase_order_lines l
                     join purchase_orders o on o.id = l.order_id
                    where l.product_id = p.id and o.status in ('approved', 'sent', 'partial')), 0) on_order
        from products p
        left join product_categories c on c.id = p.category_id
        left join units u on u.id = p.unit_id
        where p.is_active and p.type = 'stock' and p.reorder_level > 0
        order by p.name`
  );
  const list: ReorderRow[] = data
    .map((r) => {
      const onHand = round3(n(r.on_hand));
      const level = round3(n(r.reorder_level));
      const reorderQty = round3(n(r.reorder_qty));
      const onOrder = round3(n(r.on_order));
      // Bring stock back above the level, ordering at least the usual reorder quantity, less what is already on order
      const suggested = round3(Math.max(0, Math.max(reorderQty, level - onHand) - onOrder));
      const lastCost = round2(n(r.cost_price));
      return {
        productId: String(r.id),
        sku: String(r.sku),
        name: String(r.name),
        category: String(r.category),
        unit: String(r.unit),
        onHand,
        reorderLevel: level,
        reorderQty,
        onOrder,
        suggested,
        lastCost,
        estimatedCost: round2(suggested * lastCost),
        status: (onHand <= 0 ? "out" : "low") as "out" | "low",
      };
    })
    .filter((r) => r.onHand <= r.reorderLevel)
    .sort((a, b) => a.onHand / (a.reorderLevel || 1) - b.onHand / (b.reorderLevel || 1));
  return {
    rows: list,
    totals: {
      items: list.length,
      outOfStock: list.filter((r) => r.status === "out").length,
      estimatedCost: sumBy(list, (r) => r.estimatedCost),
    },
  };
}

export interface StockMovementRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  opening: number;
  inQty: number;
  outQty: number;
  closing: number;
  closingValue: number;
}

/**
 * Opening, in, out and closing quantity per product for the period, from the stock ledger. Across
 * all warehouses, transfers are left out (they move stock without changing the total).
 */
export async function stockMovementSummary(db: DbOrTx, p: Period & { warehouseId?: string | null }) {
  const whereWh = p.warehouseId ? sql`and m.warehouse_id = ${p.warehouseId}` : sql`and m.source_type not in ('transfer_in', 'transfer_out')`;
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select m.product_id, max(p.sku) sku, max(p.name) name, coalesce(max(u.code), '') unit,
          sum(case when m.date < ${p.from} then m.qty else 0 end) opening,
          sum(case when m.date >= ${p.from} and m.qty > 0 then m.qty else 0 end) in_qty,
          sum(case when m.date >= ${p.from} and m.qty < 0 then -m.qty else 0 end) out_qty,
          sum(m.value) closing_value
        from stock_movements m
        join products p on p.id = m.product_id
        left join units u on u.id = p.unit_id
        where m.date <= ${p.to} ${whereWh}
        group by m.product_id
        order by max(p.name)`
  );
  const list: StockMovementRow[] = data
    .map((r) => {
      const opening = round3(n(r.opening));
      const inQty = round3(n(r.in_qty));
      const outQty = round3(n(r.out_qty));
      return {
        productId: String(r.product_id),
        sku: String(r.sku),
        name: String(r.name),
        unit: String(r.unit),
        opening,
        inQty,
        outQty,
        closing: round3(opening + inQty - outQty),
        closingValue: round2(n(r.closing_value)),
      };
    })
    .filter((r) => r.opening !== 0 || r.inQty !== 0 || r.outQty !== 0);
  return {
    rows: list,
    totals: {
      products: list.length,
      inQty: round3(list.reduce((s, r) => s + r.inQty, 0)),
      outQty: round3(list.reduce((s, r) => s + r.outQty, 0)),
      closingValue: sumBy(list, (r) => r.closingValue),
    },
  };
}

// ---- Ageing -----------------------------------------------------------------------------------

export const AGE_BUCKETS = [
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90", label: "90+ days" },
] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number]["key"];

export interface AgedRow {
  key: string;
  partyId: string | null;
  code: string;
  name: string;
  documents: number;
  oldestDays: number;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90: number;
  total: number;
}

export function ageBucket(daysPastDue: number): AgeBucket {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "d1_30";
  if (daysPastDue <= 60) return "d31_60";
  if (daysPastDue <= 90) return "d61_90";
  return "d90";
}

function ageDocuments(docs: { partyId: string | null; code: string | null; name: string; due: string; open: number }[], asOf: string) {
  const map = new Map<string, AgedRow>();
  for (const d of docs) {
    const key = d.partyId ?? `name:${d.name}`;
    const row =
      map.get(key) ??
      ({ key, partyId: d.partyId, code: d.code ?? "—", name: d.name, documents: 0, oldestDays: 0, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0 } as AgedRow);
    const days = daysBetween(d.due, asOf);
    const b = ageBucket(days);
    row[b] = round2(row[b] + d.open);
    row.total = round2(row.total + d.open);
    row.documents += 1;
    row.oldestDays = Math.max(row.oldestDays, days);
    map.set(key, row);
  }
  const list = [...map.values()].sort((a, b) => b.total - a.total);
  const totals = {
    parties: list.length,
    documents: list.reduce((s, r) => s + r.documents, 0),
    current: sumBy(list, (r) => r.current),
    d1_30: sumBy(list, (r) => r.d1_30),
    d31_60: sumBy(list, (r) => r.d31_60),
    d61_90: sumBy(list, (r) => r.d61_90),
    d90: sumBy(list, (r) => r.d90),
    total: sumBy(list, (r) => r.total),
  };
  return { rows: list, totals, overdue: round2(totals.total - totals.current) };
}

/** Open posted invoices by customer, aged by days past due (due date, or invoice date if none). */
export async function agedReceivables(db: DbOrTx, opts: { asOf: string }) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select i.customer_id, c.code, case when i.customer_id is null then 'Walk-in customers' else coalesce(c.name, i.customer_name) end name,
          coalesce(i.due_date, i.date) due, i.total - i.amount_paid open
        from sales_invoices i left join customers c on c.id = i.customer_id
        where i.status = 'posted' and i.total - i.amount_paid > 0.004 and i.date <= ${opts.asOf}`
  );
  return ageDocuments(
    data.map((r) => ({ partyId: (r.customer_id as string | null) ?? null, code: (r.code as string | null) ?? null, name: String(r.name), due: String(r.due), open: round2(n(r.open)) })),
    opts.asOf
  );
}

/** Open posted supplier bills by supplier, aged by days past due. */
export async function agedPayables(db: DbOrTx, opts: { asOf: string }) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select b.supplier_id, s.code, coalesce(s.name, 'Unknown supplier') name, coalesce(b.due_date, b.date) due, b.total - b.amount_paid open
        from supplier_bills b left join suppliers s on s.id = b.supplier_id
        where b.status = 'posted' and b.total - b.amount_paid > 0.004 and b.date <= ${opts.asOf}`
  );
  return ageDocuments(
    data.map((r) => ({ partyId: String(r.supplier_id), code: (r.code as string | null) ?? null, name: String(r.name), due: String(r.due), open: round2(n(r.open)) })),
    opts.asOf
  );
}

// ---- Finance ----------------------------------------------------------------------------------

export interface TaxRow {
  key: string;
  source: string;
  kind: "output" | "input";
  documents: number;
  taxable: number;
  tax: number;
}

/** Output tax charged on sales vs input tax paid on purchases and expenses → net payable. */
export async function taxSummary(db: DbOrTx, p: Period) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select 'sales_invoices' k, count(*) docs, coalesce(sum(subtotal - discount_total), 0) taxable, coalesce(sum(tax_total), 0) tax
          from sales_invoices where status = 'posted' and date between ${p.from} and ${p.to}
        union all
        select 'sales_returns', count(*), coalesce(sum(subtotal - discount_total), 0), coalesce(sum(tax_total), 0)
          from sales_returns where status = 'posted' and date between ${p.from} and ${p.to}
        union all
        select 'supplier_bills', count(*), coalesce(sum(subtotal - discount_total), 0), coalesce(sum(tax_total), 0)
          from supplier_bills where status = 'posted' and date between ${p.from} and ${p.to}
        union all
        select 'purchase_returns', count(*), coalesce(sum(subtotal - discount_total), 0), coalesce(sum(tax_total), 0)
          from purchase_returns where status = 'posted' and date between ${p.from} and ${p.to}
        union all
        select 'expenses', count(*) filter (where tax_amount <> 0), coalesce(sum(amount) filter (where tax_amount <> 0), 0), coalesce(sum(tax_amount), 0)
          from expenses where status = 'posted' and date between ${p.from} and ${p.to}`
  );
  const by = new Map(data.map((r) => [String(r.k), r]));
  const mk = (key: string, source: string, kind: "output" | "input", sign: 1 | -1): TaxRow => {
    const r = by.get(key);
    return { key, source, kind, documents: n(r?.docs), taxable: round2(sign * n(r?.taxable)), tax: round2(sign * n(r?.tax)) };
  };
  const list: TaxRow[] = [
    mk("sales_invoices", "Sales invoices", "output", 1),
    mk("sales_returns", "Less: sales returns", "output", -1),
    mk("supplier_bills", "Supplier bills", "input", 1),
    mk("purchase_returns", "Less: purchase returns", "input", -1),
    mk("expenses", "Expenses with tax", "input", 1),
  ];
  const output = sumBy(list.filter((r) => r.kind === "output"), (r) => r.tax);
  const input = sumBy(list.filter((r) => r.kind === "input"), (r) => r.tax);

  // Cross-check against the tax accounts in the GL
  const [gl] = await rows<Record<string, unknown>>(
    db,
    sql`select coalesce(sum(case when a.subtype = 'tax_output' then l.credit - l.debit end), 0) output,
               coalesce(sum(case when a.subtype = 'tax_input' then l.debit - l.credit end), 0) input
        from journal_lines l join accounts a on a.id = l.account_id
        where ${postedEntry} and l.date between ${p.from} and ${p.to} and a.subtype in ('tax_output', 'tax_input')`
  );
  return {
    rows: list,
    output,
    input,
    net: round2(output - input),
    gl: { output: round2(n(gl?.output)), input: round2(n(gl?.input)), net: round2(n(gl?.output) - n(gl?.input)) },
  };
}

export interface ExpenseRow {
  accountId: string;
  code: string;
  name: string;
  group: string;
  amount: number;
  share: number;
}

/** Expense accounts for the period from the GL, largest first, with each one's share. */
export async function expenseByCategory(db: DbOrTx, p: Period & { includeCostOfSales?: boolean }) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select a.id, a.code, a.name, coalesce(pa.name, 'Other') grp, sum(l.debit - l.credit) amount
        from journal_lines l
        join accounts a on a.id = l.account_id
        left join accounts pa on pa.id = a.parent_id
        where ${postedEntry} and a.type = 'expense' and l.date between ${p.from} and ${p.to}
          ${p.includeCostOfSales === false ? sql`and coalesce(a.subtype, '') not in ('cogs', 'inventory_adjustment')` : sql``}
        group by a.id, a.code, a.name, pa.name
        having sum(l.debit - l.credit) <> 0
        order by sum(l.debit - l.credit) desc`
  );
  const total = round2(data.reduce((s, r) => s + n(r.amount), 0));
  const list: ExpenseRow[] = data.map((r) => ({
    accountId: String(r.id),
    code: String(r.code),
    name: String(r.name),
    group: String(r.grp),
    amount: round2(n(r.amount)),
    share: pct(n(r.amount), total),
  }));
  return { rows: list, total, accounts: list.length, largest: list[0] ?? null };
}

export interface CashAccountOption {
  id: string;
  code: string;
  name: string;
  subtype: string;
}

export async function cashAccounts(db: DbOrTx): Promise<CashAccountOption[]> {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select id, code, name, subtype from accounts where subtype in ${CASH_SUBTYPES} and not is_group order by code`
  );
  return data.map((r) => ({ id: String(r.id), code: String(r.code), name: String(r.name), subtype: String(r.subtype) }));
}

export interface DailyCashRow {
  date: string;
  opening: number;
  receipts: number;
  payments: number;
  closing: number;
  entries: number;
}

/**
 * Cash, bank and petty cash movement per day: opening, money in, money out, closing. With all
 * accounts selected, transfers between your own cash/bank accounts are left out.
 */
export async function dailyCash(db: DbOrTx, p: Period & { accountId?: string | null }) {
  const accounts = await cashAccounts(db);
  const ids = p.accountId ? accounts.filter((a) => a.id === p.accountId).map((a) => a.id) : accounts.map((a) => a.id);
  if (!ids.length) return { accounts, rows: [] as DailyCashRow[], opening: 0, receipts: 0, payments: 0, closing: 0 };
  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  );
  const internal = p.accountId ? sql`` : sql`and l.entry_id not in ${internalCashEntries}`;
  const [open] = await rows<Record<string, unknown>>(
    db,
    sql`select coalesce(sum(l.debit - l.credit), 0) bal from journal_lines l
        where ${postedEntry} and l.account_id in (${idList}) and l.date < ${p.from} ${internal}`
  );
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select l.date, sum(l.debit) receipts, sum(l.credit) payments, count(distinct l.entry_id) entries from journal_lines l
        where ${postedEntry} and l.account_id in (${idList}) and l.date between ${p.from} and ${p.to} ${internal}
        group by l.date order by l.date`
  );
  let running = round2(n(open?.bal));
  const opening = running;
  const list: DailyCashRow[] = data.map((r) => {
    const receipts = round2(n(r.receipts));
    const payments = round2(n(r.payments));
    const row = { date: String(r.date), opening: running, receipts, payments, closing: round2(running + receipts - payments), entries: n(r.entries) };
    running = row.closing;
    return row;
  });
  return {
    accounts,
    rows: list,
    opening,
    receipts: sumBy(list, (r) => r.receipts),
    payments: sumBy(list, (r) => r.payments),
    closing: running,
  };
}

// ---- HR ---------------------------------------------------------------------------------------

export interface PayrollRow {
  id: string;
  number: string;
  period: string;
  date: string;
  employees: number;
  gross: number;
  deductions: number;
  net: number;
  paid: number;
  outstanding: number;
}

/** Posted payroll runs whose month falls in the period. */
export async function payrollSummary(db: DbOrTx, p: Period) {
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select r.id, r.number, r.period, r.date, r.total_gross, r.total_deductions, r.total_net,
          greatest(r.total_paid, coalesce((select sum(s.paid_amount) from payslips s where s.run_id = r.id), 0)) paid,
          (select count(*) from payslips s where s.run_id = r.id) employees
        from payroll_runs r
        where r.status = 'posted' and r.period between ${p.from.slice(0, 7)} and ${p.to.slice(0, 7)}
        order by r.period`
  );
  const list: PayrollRow[] = data.map((r) => {
    const net = round2(n(r.total_net));
    const paid = round2(n(r.paid));
    return {
      id: String(r.id),
      number: String(r.number),
      period: String(r.period),
      date: String(r.date),
      employees: n(r.employees),
      gross: round2(n(r.total_gross)),
      deductions: round2(n(r.total_deductions)),
      net,
      paid,
      outstanding: round2(Math.max(net - paid, 0)),
    };
  });
  return {
    rows: list,
    totals: {
      runs: list.length,
      gross: sumBy(list, (r) => r.gross),
      deductions: sumBy(list, (r) => r.deductions),
      net: sumBy(list, (r) => r.net),
      paid: sumBy(list, (r) => r.paid),
      outstanding: sumBy(list, (r) => r.outstanding),
    },
  };
}
