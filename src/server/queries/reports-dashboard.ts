// Dashboard figures. Takes a db handle so tests can run it against an in-memory database; the
// page calls it through ./dashboard.ts (server-only). Sections the user can't see are skipped.
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { addDays, dayString, endOfMonth, parseDay, round2, startOfMonth } from "@/lib/format";
import { change, daysBetween, n, pct, rows } from "./reports-core";

export interface DashboardAccess {
  sales: boolean; // sales.view: sales KPI, sales charts, invoices, overdue
  finance: boolean; // accounting.view: profit, receivables, payables, cash, expenses, cash flow
  stockValue: boolean; // inventory.cost
  inventory: boolean; // inventory.view: low stock
  purchasing: boolean; // purchasing.view / approve: draft POs
  leave: boolean; // hr.attendance: pending leave
}

export interface Kpi {
  value: number;
  prev: number | null;
  change: number | null;
}

export interface TrendPoint {
  key: string;
  label: string;
  sales: number;
  profit: number;
}

const CASH = sql.raw(`('cash','bank','petty_cash')`);
const postedEntry = sql`l.entry_id in (select id from journal_entries where status = 'posted')`;
const internalCashEntries = sql`(select jl.entry_id from journal_lines jl join accounts a2 on a2.id = jl.account_id
  group by jl.entry_id having bool_and(coalesce(a2.subtype in ${CASH}, false)))`;

const kpi = (value: number, prev: number | null): Kpi => ({ value: round2(value), prev: prev == null ? null : round2(prev), change: prev == null ? null : change(value, prev) });

/** Same span of days in the previous month (1st..today's day number, clipped to month end). */
export function previousMonthToDate(today: string) {
  const d = parseDay(today);
  const prevStart = dayString(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const prevEnd = endOfMonth(prevStart);
  const sameDay = dayString(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
  return { from: prevStart, to: sameDay > prevEnd || sameDay.slice(0, 7) !== prevStart.slice(0, 7) ? prevEnd : sameDay };
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const shortMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" });
};
const shortDay = (key: string) => parseDay(key).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function lastMonths(today: string, count: number) {
  const d = parseDay(today);
  return Array.from({ length: count }, (_, i) => monthKey(new Date(d.getFullYear(), d.getMonth() - (count - 1 - i), 1)));
}

/** Net sales (after returns) and cost per group key for a date range. */
async function salesStream(db: DbOrTx, from: string, to: string, by: "day" | "month" | "none") {
  const key = sql.raw(by === "month" ? "substr(date, 1, 7)" : by === "day" ? "date" : "'all'");
  const data = await rows<Record<string, unknown>>(
    db,
    sql`select k, sum(net) net, sum(cost) cost, sum(cnt) cnt from (
          select ${key} k, subtotal - discount_total net, cost_total cost, 1 cnt
            from sales_invoices where status = 'posted' and date between ${from} and ${to}
          union all
          select ${key} k, -(subtotal - discount_total), -cost_total, 0
            from sales_returns where status = 'posted' and date between ${from} and ${to}
        ) t group by k`
  );
  return new Map(data.map((r) => [String(r.k), { net: round2(n(r.net)), cost: round2(n(r.cost)), count: n(r.cnt) }]));
}

async function glPeriod(db: DbOrTx, from: string, to: string) {
  const [r] = await rows<Record<string, unknown>>(
    db,
    sql`select coalesce(sum(case when a.type = 'income' then l.credit - l.debit else 0 end), 0) income,
               coalesce(sum(case when a.type = 'expense' then l.debit - l.credit else 0 end), 0) expense,
               coalesce(sum(case when a.type = 'expense' and coalesce(a.subtype, '') not in ('cogs', 'inventory_adjustment')
                                 then l.debit - l.credit else 0 end), 0) opex
        from journal_lines l join accounts a on a.id = l.account_id
        where ${postedEntry} and l.date between ${from} and ${to} and a.type in ('income', 'expense')`
  );
  const income = round2(n(r?.income));
  const expense = round2(n(r?.expense));
  return { income, expense, net: round2(income - expense), opex: round2(n(r?.opex)) };
}

async function glBalances(db: DbOrTx, to: string) {
  const [r] = await rows<Record<string, unknown>>(
    db,
    sql`select coalesce(sum(case when a.subtype = 'receivable' then l.debit - l.credit else 0 end), 0) ar,
               coalesce(sum(case when a.subtype = 'payable' then l.credit - l.debit else 0 end), 0) ap,
               coalesce(sum(case when a.subtype in ${CASH} then l.debit - l.credit else 0 end), 0) cash
        from journal_lines l join accounts a on a.id = l.account_id
        where ${postedEntry} and l.date <= ${to} and a.subtype in ('receivable', 'payable', 'cash', 'bank', 'petty_cash')`
  );
  return { receivables: round2(n(r?.ar)), payables: round2(n(r?.ap)), cash: round2(n(r?.cash)) };
}

export async function getDashboard(db: DbOrTx, opts: { today: string; access: DashboardAccess }) {
  const { today, access } = opts;
  const monthStart = startOfMonth(today);
  const prev = previousMonthToDate(today);
  const lastMonthEnd = addDays(monthStart, -1);
  const from30 = addDays(today, -29);
  const months12 = lastMonths(today, 12);
  const months6 = months12.slice(-6);

  // ---- KPIs
  const kpis: {
    sales: (Kpi & { invoices: number }) | null;
    grossProfit: (Kpi & { margin: number }) | null;
    netProfit: Kpi | null;
    expenses: Kpi | null;
    receivables: Kpi | null;
    payables: Kpi | null;
    cash: Kpi | null;
    stockValue: { value: number; products: number } | null;
  } = { sales: null, grossProfit: null, netProfit: null, expenses: null, receivables: null, payables: null, cash: null, stockValue: null };

  if (access.sales || access.finance) {
    const cur = (await salesStream(db, monthStart, today, "none")).get("all") ?? { net: 0, cost: 0, count: 0 };
    const before = (await salesStream(db, prev.from, prev.to, "none")).get("all") ?? { net: 0, cost: 0, count: 0 };
    if (access.sales) kpis.sales = { ...kpi(cur.net, before.net), invoices: cur.count };
    if (access.finance) {
      const gp = cur.net - cur.cost;
      kpis.grossProfit = { ...kpi(gp, before.net - before.cost), margin: pct(gp, cur.net) };
    }
  }
  if (access.finance) {
    const [curGl, prevGl, balNow, balPrev] = await Promise.all([
      glPeriod(db, monthStart, today),
      glPeriod(db, prev.from, prev.to),
      glBalances(db, today),
      glBalances(db, lastMonthEnd),
    ]);
    kpis.netProfit = kpi(curGl.net, prevGl.net);
    kpis.expenses = kpi(curGl.opex, prevGl.opex);
    kpis.receivables = kpi(balNow.receivables, balPrev.receivables);
    kpis.payables = kpi(balNow.payables, balPrev.payables);
    kpis.cash = kpi(balNow.cash, balPrev.cash);
  }
  if (access.stockValue) {
    const [r] = await rows<Record<string, unknown>>(
      db,
      sql`select coalesce(sum(qty * avg_cost), 0) value, count(distinct product_id) filter (where qty > 0) products from stock_balances`
    );
    kpis.stockValue = { value: round2(n(r?.value)), products: n(r?.products) };
  }

  // ---- Charts
  let trendDaily: TrendPoint[] = [];
  let trendMonthly: TrendPoint[] = [];
  let byCategory: { name: string; value: number }[] = [];
  let topProducts: { name: string; value: number; qty: number }[] = [];
  let cashFlow: { key: string; label: string; in: number; out: number }[] = [];

  if (access.sales) {
    const daily = await salesStream(db, from30, today, "day");
    trendDaily = Array.from({ length: 30 }, (_, i) => {
      const k = addDays(from30, i);
      const v = daily.get(k);
      return { key: k, label: shortDay(k), sales: v?.net ?? 0, profit: round2((v?.net ?? 0) - (v?.cost ?? 0)) };
    });
    const monthly = await salesStream(db, `${months12[0]}-01`, today, "month");
    trendMonthly = months12.map((k) => {
      const v = monthly.get(k);
      return { key: k, label: shortMonth(k), sales: v?.net ?? 0, profit: round2((v?.net ?? 0) - (v?.cost ?? 0)) };
    });

    const lines = sql`(
      select l.product_id, l.description, l.qty, l.line_total - l.tax_amount revenue
        from sales_invoice_lines l join sales_invoices i on i.id = l.invoice_id
       where i.status = 'posted' and i.date between ${from30} and ${today}
      union all
      select l.product_id, l.description, -l.qty, -(l.line_total - l.tax_amount)
        from sales_return_lines l join sales_returns r on r.id = l.return_id
       where r.status = 'posted' and r.date between ${from30} and ${today}
    )`;
    const cats = await rows<Record<string, unknown>>(
      db,
      sql`select coalesce(max(c.name), 'Uncategorised') name, sum(t.revenue) value from ${lines} t
          left join products p on p.id = t.product_id left join product_categories c on c.id = p.category_id
          group by p.category_id having sum(t.revenue) > 0 order by sum(t.revenue) desc`
    );
    const catList = cats.map((r) => ({ name: String(r.name), value: round2(n(r.value)) }));
    byCategory = catList.length > 5 ? [...catList.slice(0, 4), { name: "Other", value: round2(catList.slice(4).reduce((s, r) => s + r.value, 0)) }] : catList;

    const prods = await rows<Record<string, unknown>>(
      db,
      sql`select coalesce(max(p.name), max(t.description)) name, sum(t.revenue) value, sum(t.qty) qty from ${lines} t
          left join products p on p.id = t.product_id
          group by coalesce(t.product_id, t.description) having sum(t.revenue) > 0 order by sum(t.revenue) desc limit 5`
    );
    topProducts = prods.map((r) => ({ name: String(r.name), value: round2(n(r.value)), qty: n(r.qty) }));
  }

  if (access.finance) {
    const flow = await rows<Record<string, unknown>>(
      db,
      sql`select substr(l.date, 1, 7) k, sum(l.debit) cash_in, sum(l.credit) cash_out
          from journal_lines l join accounts a on a.id = l.account_id
          where ${postedEntry} and a.subtype in ${CASH} and l.date between ${`${months6[0]}-01`} and ${today}
            and l.entry_id not in ${internalCashEntries}
          group by 1`
    );
    const map = new Map(flow.map((r) => [String(r.k), { in: round2(n(r.cash_in)), out: round2(n(r.cash_out)) }]));
    cashFlow = months6.map((k) => ({ key: k, label: shortMonth(k), in: map.get(k)?.in ?? 0, out: map.get(k)?.out ?? 0 }));
  }

  // ---- Lists
  let recentInvoices: { id: string; number: string; date: string; customerName: string; total: number; paymentStatus: string }[] = [];
  let overdue = { rows: [] as { id: string; number: string; customerName: string; dueDate: string; daysOverdue: number; open: number }[], count: 0, amount: 0 };
  if (access.sales) {
    const inv = await rows<Record<string, unknown>>(
      db,
      sql`select id, number, date, customer_name, total, payment_status from sales_invoices
          where status = 'posted' order by date desc, created_at desc limit 6`
    );
    recentInvoices = inv.map((r) => ({
      id: String(r.id),
      number: String(r.number),
      date: String(r.date),
      customerName: String(r.customer_name),
      total: round2(n(r.total)),
      paymentStatus: String(r.payment_status),
    }));
    const od = await rows<Record<string, unknown>>(
      db,
      sql`select id, number, customer_name, due_date, total - amount_paid open from sales_invoices
          where status = 'posted' and due_date is not null and due_date < ${today} and total - amount_paid > 0.004
          order by due_date asc`
    );
    overdue = {
      rows: od.slice(0, 6).map((r) => ({
        id: String(r.id),
        number: String(r.number),
        customerName: String(r.customer_name),
        dueDate: String(r.due_date),
        daysOverdue: daysBetween(String(r.due_date), today),
        open: round2(n(r.open)),
      })),
      count: od.length,
      amount: round2(od.reduce((s, r) => s + n(r.open), 0)),
    };
  }

  let lowStock = { rows: [] as { id: string; sku: string; name: string; unit: string; onHand: number; reorderLevel: number }[], count: 0 };
  if (access.inventory) {
    const ls = await rows<Record<string, unknown>>(
      db,
      sql`select * from (
            select p.id, p.sku, p.name, coalesce(u.code, '') unit, p.reorder_level,
                   coalesce((select sum(b.qty) from stock_balances b where b.product_id = p.id), 0) on_hand
              from products p left join units u on u.id = p.unit_id
             where p.is_active and p.type = 'stock' and p.reorder_level > 0
          ) t where on_hand <= reorder_level order by on_hand / reorder_level asc, name`
    );
    lowStock = {
      rows: ls.slice(0, 6).map((r) => ({
        id: String(r.id),
        sku: String(r.sku),
        name: String(r.name),
        unit: String(r.unit),
        onHand: n(r.on_hand),
        reorderLevel: n(r.reorder_level),
      })),
      count: ls.length,
    };
  }

  const approvals = {
    purchaseOrders: [] as { id: string; number: string; supplier: string; date: string; total: number }[],
    purchaseOrderCount: 0,
    leave: [] as { id: string; employee: string; type: string; fromDate: string; toDate: string; days: number }[],
    leaveCount: 0,
  };
  if (access.purchasing) {
    const pos = await rows<Record<string, unknown>>(
      db,
      sql`select o.id, o.number, o.date, o.total, coalesce(s.name, '') supplier from purchase_orders o
          left join suppliers s on s.id = o.supplier_id where o.status = 'draft' order by o.date desc, o.created_at desc`
    );
    approvals.purchaseOrderCount = pos.length;
    approvals.purchaseOrders = pos.slice(0, 4).map((r) => ({ id: String(r.id), number: String(r.number), supplier: String(r.supplier), date: String(r.date), total: round2(n(r.total)) }));
  }
  if (access.leave) {
    const lv = await rows<Record<string, unknown>>(
      db,
      sql`select r.id, e.name employee, coalesce(t.name, '') type, r.from_date, r.to_date, r.days from leave_requests r
          join employees e on e.id = r.employee_id left join leave_types t on t.id = r.leave_type_id
          where r.status = 'pending' order by r.from_date asc`
    );
    approvals.leaveCount = lv.length;
    approvals.leave = lv.slice(0, 4).map((r) => ({
      id: String(r.id),
      employee: String(r.employee),
      type: String(r.type),
      fromDate: String(r.from_date),
      toDate: String(r.to_date),
      days: n(r.days),
    }));
  }

  return {
    today,
    period: { from: monthStart, to: today, prevFrom: prev.from, prevTo: prev.to },
    kpis,
    trendDaily,
    trendMonthly,
    byCategory,
    topProducts,
    cashFlow,
    recentInvoices,
    overdue,
    lowStock,
    approvals,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
