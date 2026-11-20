// Tests for Dashboard, Reports and Administration: admin services, and report/dashboard queries on
// an empty database and after inserting a few posted documents.
//   npx tsx scripts/test-admin.ts
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as s from "../src/db/schema";
import type { DB } from "../src/db/client";
import { ALL_PERMISSIONS } from "../src/lib/permissions";
import { postJournal } from "../src/server/services/accounting";
import { ACC } from "../src/server/services/chart-of-accounts";
import { nextNumber } from "../src/server/services/numbering";
import { moveStock } from "../src/server/services/stock";
import {
  assertCanManageAdmin,
  createRole,
  createUser,
  deleteRole,
  deleteUserSessions,
  resetUserPassword,
  setLockDate,
  updateCompany,
  updateNumberSeries,
  updateRole,
  updateUser,
} from "../src/server/services/admin";
import { auditFilterOptions, auditLog, listNumberSeries, listRoles, listUsers } from "../src/server/queries/admin-core";
import * as R from "../src/server/queries/reports-core";
import { getDashboard, previousMonthToDate, type DashboardAccess } from "../src/server/queries/reports-dashboard";
import { check, createTestDb, done, expectError, makeProduct, warehouseId } from "./test-utils";

const TODAY = "2026-11-05";
const ALL: DashboardAccess = { sales: true, finance: true, stockValue: true, inventory: true, purchasing: true, leave: true };
const month = { from: "2026-11-01", to: "2026-11-30" };

/** True when no number anywhere in the value is NaN or infinite. */
function allFinite(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(allFinite);
  if (v && typeof v === "object") return Object.values(v).every(allFinite);
  return true;
}

async function runAllReports(db: DB, p = month) {
  return {
    salesSummary: await R.salesSummary(db, { ...p, group: "day" }),
    salesSummaryMonth: await R.salesSummary(db, { ...p, group: "month" }),
    salesByProduct: await R.salesByProduct(db, p),
    salesByCustomer: await R.salesByCustomer(db, p),
    salesByCategory: await R.salesByCategory(db, p),
    salesBySalesperson: await R.salesBySalesperson(db, p),
    purchasesBySupplier: await R.purchasesBySupplier(db, p),
    purchasesByProduct: await R.purchasesByProduct(db, p),
    inventoryValuation: await R.inventoryValuation(db),
    reorder: await R.reorderReport(db),
    stockMovement: await R.stockMovementSummary(db, p),
    agedReceivables: await R.agedReceivables(db, { asOf: TODAY }),
    agedPayables: await R.agedPayables(db, { asOf: TODAY }),
    tax: await R.taxSummary(db, p),
    expenses: await R.expenseByCategory(db, p),
    dailyCash: await R.dailyCash(db, p),
    payroll: await R.payrollSummary(db, { from: "2026-01-01", to: "2026-12-31" }),
  };
}

async function main() {
  const { db, close, actor } = await createTestDb();
  const hash = (pw: string) => bcrypt.hash(pw, 4);

  // ---------------------------------------------------------------------------------------------
  console.log("Empty database");
  const empty = await getDashboard(db, { today: TODAY, access: ALL });
  check("dashboard has no NaN/Infinity", allFinite(empty));
  check("sales KPI zero", empty.kpis.sales?.value === 0 && empty.kpis.sales.change === null, empty.kpis.sales);
  check("gross profit + margin zero", empty.kpis.grossProfit?.value === 0 && empty.kpis.grossProfit.margin === 0, empty.kpis.grossProfit);
  check("net profit zero", empty.kpis.netProfit?.value === 0);
  check("receivables/payables/cash zero", empty.kpis.receivables?.value === 0 && empty.kpis.payables?.value === 0 && empty.kpis.cash?.value === 0);
  check("stock value zero", empty.kpis.stockValue?.value === 0 && empty.kpis.stockValue.products === 0);
  check("30-day trend filled with zeros", empty.trendDaily.length === 30 && empty.trendDaily.every((p) => p.sales === 0), empty.trendDaily.length);
  check("12-month trend filled", empty.trendMonthly.length === 12 && empty.trendMonthly[11].key === "2026-11", empty.trendMonthly.at(-1));
  check("6-month cash flow filled", empty.cashFlow.length === 6 && empty.cashFlow.every((m) => m.in === 0 && m.out === 0));
  check("empty lists", !empty.recentInvoices.length && !empty.overdue.count && !empty.lowStock.count && !empty.approvals.purchaseOrderCount && !empty.approvals.leaveCount);
  const limited = await getDashboard(db, { today: TODAY, access: { sales: true, finance: false, stockValue: false, inventory: false, purchasing: false, leave: false } });
  check("finance KPIs hidden without accounting access", limited.kpis.netProfit === null && limited.kpis.grossProfit === null && limited.kpis.cash === null && limited.cashFlow.length === 0);
  check("stock value hidden without cost access", limited.kpis.stockValue === null);

  const emptyReports = await runAllReports(db);
  check("all reports finite on empty db", allFinite(emptyReports));
  check("all report row lists empty (tax has fixed lines)", Object.entries(emptyReports).filter(([k]) => k !== "tax").map(([, v]) => v).every((r) => !("rows" in r) || (r as { rows: unknown[] }).rows.length === 0));
  check("tax summary has five zero lines", emptyReports.tax.rows.length === 5 && emptyReports.tax.net === 0);
  check("valuation empty", emptyReports.inventoryValuation.items.length === 0 && emptyReports.inventoryValuation.totals.value === 0);
  check("daily cash lists cash accounts", emptyReports.dailyCash.accounts.length === 3 && emptyReports.dailyCash.closing === 0, emptyReports.dailyCash.accounts.length);
  check("previous month-to-date span", JSON.stringify(previousMonthToDate("2026-03-31")) === JSON.stringify({ from: "2026-02-01", to: "2026-02-28" }), previousMonthToDate("2026-03-31"));

  // ---------------------------------------------------------------------------------------------
  console.log("With data");
  const wh = await warehouseId(db);
  const [cat] = await db.insert(s.productCategories).values({ name: "Lawn" }).returning();
  const p1 = await makeProduct(db, { name: "Lawn Print", categoryId: cat.id, reorderLevel: 20, reorderQty: 50 });
  const p2 = await makeProduct(db, { name: "Plain Cotton", reorderLevel: 0 });
  await moveStock(db, actor, { date: "2026-10-01", productId: p1.id, warehouseId: wh, qty: 30, unitCost: 100, sourceType: "opening" });
  await moveStock(db, actor, { date: "2026-10-01", productId: p2.id, warehouseId: wh, qty: 10, unitCost: 50, sourceType: "opening" });
  await postJournal(db, actor, { date: "2026-10-01", memo: "opening stock", lines: [{ account: ACC.INVENTORY, debit: 3500 }, { account: ACC.OPENING_BALANCE, credit: 3500 }] });
  await postJournal(db, actor, { date: "2026-10-01", memo: "capital", lines: [{ account: ACC.CASH, debit: 50000 }, { account: ACC.CAPITAL, credit: 50000 }] });

  const [cust] = await db.insert(s.customers).values({ code: "C-1", name: "Ayesha Fabrics" }).returning();
  const [supp] = await db.insert(s.suppliers).values({ code: "S-1", name: "Gul Textiles" }).returning();

  // Posted invoice this month: 15 m × 160 = 2400, 10% discount on line → net 2160, tax 18% 388.8 → total 2548.8
  async function invoice(o: { date: string; due?: string; qty: number; price: number; disc?: number; taxRate?: number; status?: "posted" | "draft"; paid?: number; salesperson?: string; customer?: boolean; productId?: string }) {
    const gross = o.qty * o.price;
    const discount = o.disc ?? 0;
    const net = gross - discount;
    const tax = Math.round(net * (o.taxRate ?? 0)) / 100;
    const total = net + tax;
    const productId = o.productId ?? p1.id;
    const status = o.status ?? "posted";
    let cost = 0;
    if (status === "posted") {
      const mv = await moveStock(db, actor, { date: o.date, productId, warehouseId: wh, qty: -o.qty, sourceType: "sales_invoice" });
      cost = -mv.value;
    }
    const [inv] = await db
      .insert(s.salesInvoices)
      .values({
        number: await nextNumber(db, "SI"),
        date: o.date,
        dueDate: o.due ?? null,
        customerId: o.customer === false ? null : cust.id,
        customerName: o.customer === false ? "Walk-in" : cust.name,
        warehouseId: wh,
        salesperson: o.salesperson ?? null,
        status,
        subtotal: gross,
        discountTotal: discount,
        taxTotal: tax,
        total,
        amountPaid: o.paid ?? 0,
        costTotal: cost,
      })
      .returning();
    await db.insert(s.salesInvoiceLines).values({
      invoiceId: inv.id,
      productId,
      description: "line",
      qty: o.qty,
      unitPrice: o.price,
      discountAmount: discount,
      taxRate: o.taxRate ?? 0,
      taxAmount: tax,
      lineTotal: total,
      unitCost: o.qty ? cost / o.qty : 0,
    });
    if (status === "posted") {
      await postJournal(db, actor, {
        date: o.date,
        sourceType: "sales_invoice",
        sourceId: inv.id,
        lines: [
          { account: ACC.RECEIVABLE, debit: total, partyType: "customer", partyId: o.customer === false ? null : cust.id },
          { account: ACC.SALES, credit: net },
          { account: ACC.OUTPUT_TAX, credit: tax },
          { account: ACC.COGS, debit: cost },
          { account: ACC.INVENTORY, credit: cost },
        ],
      });
    }
    return { ...inv, net, cost };
  }

  const inv1 = await invoice({ date: "2026-11-03", due: "2026-12-03", qty: 15, price: 160, disc: 240, taxRate: 18, salesperson: "Bilal" });
  await invoice({ date: "2026-09-01", due: "2026-09-15", qty: 5, price: 200, salesperson: " " }); // old, overdue 51 days
  await invoice({ date: "2026-11-04", qty: 3, price: 150, status: "draft" }); // drafts never count
  const inv3 = await invoice({ date: "2026-11-04", qty: 2, price: 90, productId: p2.id, customer: false, paid: 180 }); // walk-in, paid in cash
  await postJournal(db, actor, { date: "2026-11-04", sourceType: "customer_receipt", lines: [{ account: ACC.CASH, debit: 180 }, { account: ACC.RECEIVABLE, credit: 180 }] });

  // Posted sales return this month: 1 m of p1 back at 144 net (no tax)
  const unitCost1 = inv1.cost / 15;
  await moveStock(db, actor, { date: "2026-11-04", productId: p1.id, warehouseId: wh, qty: 1, unitCost: unitCost1, sourceType: "sales_return" });
  const [ret] = await db
    .insert(s.salesReturns)
    .values({ number: await nextNumber(db, "SR"), date: "2026-11-04", invoiceId: inv1.id, customerId: cust.id, customerName: cust.name, warehouseId: wh, status: "posted", subtotal: 144, total: 144, costTotal: unitCost1 })
    .returning();
  await db.insert(s.salesReturnLines).values({ returnId: ret.id, productId: p1.id, description: "return", qty: 1, unitPrice: 144, lineTotal: 144, unitCost: unitCost1 });
  await postJournal(db, actor, {
    date: "2026-11-04",
    sourceType: "sales_return",
    lines: [
      { account: ACC.SALES_RETURNS, debit: 144 },
      { account: ACC.RECEIVABLE, credit: 144, partyType: "customer", partyId: cust.id },
      { account: ACC.INVENTORY, debit: unitCost1 },
      { account: ACC.COGS, credit: unitCost1 },
    ],
  });

  // Posted supplier bill (old, overdue 95 days) and a draft one; expense with tax; bank transfer (internal)
  await db.insert(s.supplierBills).values([
    { number: "BILL-1", date: "2026-07-01", dueDate: "2026-08-01", supplierId: supp.id, status: "posted", subtotal: 5000, taxTotal: 900, total: 5900, amountPaid: 900 },
    { number: "BILL-2", date: "2026-11-02", dueDate: "2026-12-02", supplierId: supp.id, status: "posted", subtotal: 1000, taxTotal: 180, total: 1180 },
    { number: "BILL-3", date: "2026-11-02", supplierId: supp.id, status: "draft", subtotal: 9999, total: 9999 },
  ]);
  await postJournal(db, actor, { date: "2026-11-02", lines: [{ account: ACC.INVENTORY, debit: 1000 }, { account: ACC.INPUT_TAX, debit: 180 }, { account: ACC.PAYABLE, credit: 1180, partyType: "supplier", partyId: supp.id }] });
  const rentId = (await db.select().from(s.accounts).where(eq(s.accounts.code, "6200")))[0].id;
  await db.insert(s.expenses).values({ number: "EXP-1", date: "2026-11-02", expenseAccountId: rentId, paidFromAccountId: rentId, amount: 1000, taxAmount: 50, description: "rent" });
  await postJournal(db, actor, { date: "2026-11-02", sourceType: "expense", lines: [{ account: "6200", debit: 1000 }, { account: ACC.INPUT_TAX, debit: 50 }, { account: ACC.CASH, credit: 1050 }] });
  await postJournal(db, actor, { date: "2026-11-03", sourceType: "bank_transfer", lines: [{ account: ACC.BANK, debit: 10000 }, { account: ACC.CASH, credit: 10000 }] });
  const voided = await postJournal(db, actor, { date: "2026-11-03", lines: [{ account: "6200", debit: 777 }, { account: ACC.CASH, credit: 777 }] });
  await db.update(s.journalEntries).set({ status: "void" }).where(eq(s.journalEntries.id, voided.id));

  // HR: a posted payroll run and a pending leave; purchasing: a draft PO
  const [emp] = await db.insert(s.employees).values({ code: "E-1", name: "Sana", joinDate: "2026-01-01" }).returning();
  const [lt] = await db.insert(s.leaveTypes).values({ name: "Annual" }).returning();
  await db.insert(s.leaveRequests).values({ employeeId: emp.id, leaveTypeId: lt.id, fromDate: "2026-11-10", toDate: "2026-11-11", days: 2 });
  const [run] = await db.insert(s.payrollRuns).values({ number: "PRL-1", period: "2026-10", date: "2026-10-31", status: "posted", totalGross: 50000, totalDeductions: 5000, totalNet: 45000, totalPaid: 20000 }).returning();
  await db.insert(s.payslips).values({ runId: run.id, employeeId: emp.id, gross: 50000, net: 45000, paidAmount: 20000 });
  await db.insert(s.payrollRuns).values({ number: "PRL-2", period: "2026-11", date: "2026-11-30", status: "draft", totalGross: 99999 });
  await db.insert(s.purchaseOrders).values({ number: "PO-1", date: "2026-11-01", supplierId: supp.id, warehouseId: wh, total: 4321 });

  const d = await getDashboard(db, { today: TODAY, access: ALL });
  const netSales = 2160 + 180 - 144; // invoices net less return
  const cost = inv1.cost + inv3.cost - unitCost1;
  check("dashboard finite with data", allFinite(d));
  check("sales this month = net after returns", d.kpis.sales?.value === netSales, d.kpis.sales);
  check("invoice count excludes drafts", d.kpis.sales?.invoices === 2, d.kpis.sales?.invoices);
  check("gross profit = net − cost", d.kpis.grossProfit?.value === Math.round((netSales - cost) * 100) / 100, { gp: d.kpis.grossProfit, expected: netSales - cost });
  check("margin %", d.kpis.grossProfit?.margin === Math.round(((netSales - cost) / netSales) * 10000) / 100, d.kpis.grossProfit?.margin);
  check("net profit from GL (sales − returns − cogs − rent)", d.kpis.netProfit?.value === Math.round((2160 + 180 - 144 - cost - 1000) * 100) / 100, d.kpis.netProfit);
  check("expenses this month excludes cost of sales and voided", d.kpis.expenses?.value === 1000, d.kpis.expenses);
  check("receivables from GL", d.kpis.receivables?.value === Math.round((2548.8 + 1000 + 180 - 180 - 144) * 100) / 100, d.kpis.receivables);
  check("payables from GL", d.kpis.payables?.value === 1180, d.kpis.payables);
  check("cash & bank sums cash, bank, petty", d.kpis.cash?.value === 50000 - 1050 + 180, d.kpis.cash);
  check("cash vs last month end", d.kpis.cash?.prev === 50000 && d.kpis.cash.change !== null, d.kpis.cash);
  check("stock value = qty × avg cost", d.kpis.stockValue?.value === (30 - 5 - 15 + 1) * 100 + (10 - 2) * 50, d.kpis.stockValue);
  check("daily trend has today's sales", d.trendDaily.find((p) => p.key === "2026-11-03")?.sales === 2160);
  check("monthly trend has September", d.trendMonthly.find((p) => p.key === "2026-09")?.sales === 1000);
  check("category donut", d.byCategory[0]?.name === "Lawn" && d.byCategory.some((c) => c.name === "Uncategorised"), d.byCategory);
  check("top products by revenue", d.topProducts[0]?.name === "Lawn Print" && d.topProducts[0].value === 2160 - 144, d.topProducts);
  const nov = d.cashFlow.find((m) => m.key === "2026-11");
  check("cash flow excludes internal transfers", nov?.in === 180 && nov.out === 1050, nov);
  check("recent invoices are posted only", d.recentInvoices.length === 3 && d.recentInvoices[0].number === inv3.number, d.recentInvoices.map((i) => i.number));
  check("overdue receivables", d.overdue.count === 1 && d.overdue.amount === 1000 && d.overdue.rows[0].daysOverdue === 51, d.overdue);
  check("low stock (11 ≤ 20)", d.lowStock.count === 1 && d.lowStock.rows[0].onHand === 11, d.lowStock);
  check("pending approvals", d.approvals.purchaseOrderCount === 1 && d.approvals.leaveCount === 1 && d.approvals.leave[0].employee === "Sana");

  const r = await runAllReports(db);
  check("reports finite with data", allFinite(r));
  check("sales summary by day", r.salesSummary.rows.length === 2 && r.salesSummary.totals.net === 2340 && r.salesSummary.totals.returns === 144 && r.salesSummary.totals.invoices === 2, r.salesSummary.totals);
  check("sales summary gross/discount/tax", r.salesSummary.totals.gross === 2580 && r.salesSummary.totals.discounts === 240 && r.salesSummary.totals.tax === 388.8, r.salesSummary.totals);
  check("sales summary by month", r.salesSummaryMonth.rows.length === 1 && r.salesSummaryMonth.rows[0].period === "2026-11");
  const sp1 = r.salesByProduct.rows.find((x) => x.productId === p1.id);
  check("sales by product nets returns", sp1?.qty === 15 && sp1.returnedQty === 1 && sp1.revenue === 2016, sp1);
  check("sales by product margin", sp1 !== undefined && sp1.margin === Math.round(((sp1.revenue - sp1.cost) / sp1.revenue) * 10000) / 100);
  check("sales by customer incl. walk-in", r.salesByCustomer.rows.length === 2 && r.salesByCustomer.rows.some((x) => x.name === "Walk-in customers"), r.salesByCustomer.rows.map((x) => x.name));
  const ayesha = r.salesByCustomer.rows.find((x) => x.customerId === cust.id);
  check("customer returns + outstanding", ayesha?.returns === 144 && ayesha.outstanding === 2548.8, ayesha);
  check("sales by category shares add to 100", Math.round(r.salesByCategory.rows.reduce((a, x) => a + x.share, 0)) === 100, r.salesByCategory.rows);
  check("salesperson buckets", r.salesBySalesperson.rows.find((x) => x.name === "Bilal")?.returns === 144 && r.salesBySalesperson.rows.some((x) => x.name === "Unassigned"), r.salesBySalesperson.rows);
  check("purchases by supplier (posted, in period)", r.purchasesBySupplier.totals.total === 1180 && r.purchasesBySupplier.totals.bills === 1, r.purchasesBySupplier.totals);
  check("inventory valuation", r.inventoryValuation.totals.value === 1500 && r.inventoryValuation.byWarehouse.length === 1 && r.inventoryValuation.byCategory.length === 2, r.inventoryValuation.totals);
  const ro = r.reorder.rows[0];
  check("reorder suggestion", r.reorder.rows.length === 1 && ro.suggested === 50 && ro.estimatedCost === 50 * 100, ro);
  const mv = r.stockMovement.rows.find((x) => x.productId === p1.id);
  check("stock movement opening/in/out/closing", mv?.opening === 25 && mv.inQty === 1 && mv.outQty === 15 && mv.closing === 11 + 0, mv);
  check("aged receivables buckets", r.agedReceivables.totals.total === 3548.8 && r.agedReceivables.totals.current === 2548.8 && r.agedReceivables.totals.d31_60 === 1000, r.agedReceivables.totals);
  check("aged payables 90+", r.agedPayables.totals.d90 === 5000 && r.agedPayables.totals.current === 1180, r.agedPayables.totals);
  check("tax summary output − input", r.tax.output === 388.8 && r.tax.input === 230 && r.tax.net === 158.8, { o: r.tax.output, i: r.tax.input });
  check("tax GL cross-check", r.tax.gl.output === 388.8 && r.tax.gl.input === 230, r.tax.gl);
  check("expense by category (GL, posted only)", r.expenses.rows.find((x) => x.code === "6200")?.amount === 1000 && Math.round(r.expenses.rows.reduce((a, x) => a + x.share, 0)) === 100, r.expenses.rows);
  check("daily cash all accounts", r.dailyCash.opening === 50000 && r.dailyCash.receipts === 180 && r.dailyCash.payments === 1050 && r.dailyCash.closing === 49130, {
    o: r.dailyCash.opening,
    rc: r.dailyCash.receipts,
    p: r.dailyCash.payments,
    c: r.dailyCash.closing,
  });
  const bankId = r.dailyCash.accounts.find((a) => a.code === ACC.BANK)!.id;
  const bank = await R.dailyCash(db, { ...month, accountId: bankId });
  check("daily cash single account includes transfers", bank.receipts === 10000 && bank.closing === 10000, bank.closing);
  check("payroll summary posted only", r.payroll.rows.length === 1 && r.payroll.totals.outstanding === 25000, r.payroll.totals);
  // Stock movement for a stock product with a reorder level below which it isn't → excluded from reorder
  check("p2 not in reorder (no level)", !r.reorder.rows.some((x) => x.productId === p2.id));
  // makeProduct units: p1/p2 are fractional "m" units
  check("units reported", sp1?.unit === "m");

  // ---------------------------------------------------------------------------------------------
  console.log("Users & roles");
  const [adminRole] = await db.select().from(s.roles);
  const role = await createRole(db, actor, { name: "Sales Clerk", description: "Front desk", permissions: ["sales.view", "sales.create", "sales.view"] });
  let roles = await listRoles(db);
  const clerk = roles.find((x) => x.id === role.id)!;
  check("role created with de-duplicated permissions", clerk.permissions.length === 2 && clerk.userCount === 0, clerk.permissions);
  await expectError("duplicate role name rejected", () => createRole(db, actor, { name: "sales clerk", permissions: [] }), /already exists/);
  await expectError("unknown permission rejected", () => createRole(db, actor, { name: "Bad", permissions: ["nope.view"] }), /Unknown permission/);
  await updateRole(db, actor, { id: role.id, name: "Sales Desk", permissions: ["sales.view", "sales.pos", "reports.view", "dashboard.view"] });
  roles = await listRoles(db);
  const desk = roles.find((x) => x.id === role.id)!;
  check("permission matrix saved + renamed", desk.name === "Sales Desk" && desk.permissions.includes("sales.pos") && !desk.permissions.includes("sales.create"), desk);
  await updateRole(db, actor, { id: role.id, name: "Sales Desk", permissions: [...ALL_PERMISSIONS] });
  check("select-all grants every permission", (await listRoles(db)).find((x) => x.id === role.id)!.permissions.length === ALL_PERMISSIONS.length);
  await expectError("Administrator role is locked", () => updateRole(db, actor, { id: adminRole.id, name: "Admin", permissions: [] }), /can't be changed/);
  await expectError("Administrator role can't be deleted", () => deleteRole(db, actor, adminRole.id), /built-in/);

  const u1 = await createUser(db, actor, { name: "Hina", email: "Hina@Shop.PK", roleId: role.id, passwordHash: await hash("secret123") });
  const users1 = await listUsers(db);
  const hina = users1.find((x) => x.id === u1.id)!;
  check("user created, email lower-cased", hina.email === "hina@shop.pk" && hina.roleName === "Sales Desk" && hina.isActive);
  await expectError("duplicate email rejected", () => createUser(db, actor, { name: "X", email: "hina@shop.pk", roleId: role.id, passwordHash: "x" }), /already exists/);
  await expectError("role in use can't be deleted", () => deleteRole(db, actor, role.id), /Move them/);

  await expectError("can't deactivate yourself", () => updateUser(db, actor, { id: actor.id, name: "Tester", roleId: adminRole.id, isActive: false }), /your own account/);
  await expectError("last Administrator can't be demoted", () => updateUser(db, actor, { id: actor.id, name: "Tester", roleId: role.id, isActive: true }), /last active Administrator/);
  await updateUser(db, actor, { id: u1.id, name: "Hina Khan", roleId: adminRole.id, isActive: true });
  await updateUser(db, actor, { id: actor.id, name: "Tester", roleId: role.id, isActive: true });
  check("demotion allowed once another admin exists", (await listUsers(db)).find((x) => x.id === actor.id)!.roleName === "Sales Desk");
  await expectError("now Hina is the last admin", () => updateUser(db, actor, { id: u1.id, name: "Hina Khan", roleId: adminRole.id, isActive: false }), /last active Administrator/);

  await db.insert(s.sessions).values([
    { id: "sess-a", userId: u1.id, expiresAt: new Date(Date.now() + 3600_000) },
    { id: "sess-b", userId: u1.id, expiresAt: new Date(Date.now() + 3600_000) },
  ]);
  await resetUserPassword(db, actor, { id: u1.id, passwordHash: await hash("newpass123") });
  const [hRow] = await db.select().from(s.users).where(eq(s.users.id, u1.id));
  check("password reset stores bcrypt hash", await bcrypt.compare("newpass123", hRow.passwordHash));
  check("password reset ends the user's sessions", (await db.select().from(s.sessions).where(eq(s.sessions.userId, u1.id))).length === 0);
  await db.insert(s.sessions).values({ id: "sess-c", userId: actor.id, expiresAt: new Date(Date.now() + 3600_000) });
  check("sign out everywhere", (await deleteUserSessions(db, actor, actor.id)).removed === 1);

  const managerPerms = ["settings.users"];
  await expectError("non-admin can't grant the Administrator role", () => assertCanManageAdmin(db, managerPerms, { roleId: adminRole.id }), /Only an Administrator/);
  await expectError("non-admin can't change an Administrator", () => assertCanManageAdmin(db, managerPerms, { userId: u1.id }), /Only an Administrator/);
  await assertCanManageAdmin(db, managerPerms, { roleId: role.id, userId: actor.id });
  check("non-admin can manage non-admin users", true);
  await assertCanManageAdmin(db, ["*"], { roleId: adminRole.id, userId: u1.id });
  check("admin can grant the Administrator role", true);

  const role2 = await createRole(db, actor, { name: "Temp", permissions: [] });
  await deleteRole(db, actor, role2.id);
  check("unused role deleted", !(await listRoles(db)).some((x) => x.id === role2.id));

  // ---------------------------------------------------------------------------------------------
  console.log("Company, numbering & lock date");
  await updateCompany(db, actor, { name: "Shusui Textiles", currency: "pkr", currencySymbol: "Rs", fiscalYearStartMonth: 7, email: "", logoUrl: "https://x.test/logo.png" });
  const [co] = await db.select().from(s.company);
  check("company profile saved", co.name === "Shusui Textiles" && co.currency === "PKR" && co.email === null);
  await expectError("bad email rejected", () => updateCompany(db, actor, { name: "X", currency: "PKR", currencySymbol: "Rs", fiscalYearStartMonth: 7, email: "nope" }));

  let series = await listNumberSeries(db);
  const si = series.find((x) => x.key === "SI")!;
  check("series list includes unused series with defaults", series.find((x) => x.key === "PO")?.inUse === false && si.nextNumber === 5, si);
  const res = await updateNumberSeries(db, actor, { key: "SI", prefix: "SI-26-", nextNumber: 42, padding: 4 });
  check("series preview", res.preview === "SI-26-0042", res.preview);
  check("next invoice uses edited series", (await nextNumber(db, "SI")) === "SI-26-0042");
  await expectError("can't move a series backwards", () => updateNumberSeries(db, actor, { key: "SI", prefix: "SI-26-", nextNumber: 10, padding: 4 }), /may already be used/);
  await updateNumberSeries(db, actor, { key: "PO", prefix: "PUR-", nextNumber: 100, padding: 5 });
  series = await listNumberSeries(db);
  check("unused series can be configured", series.find((x) => x.key === "PO")?.prefix === "PUR-" && (await nextNumber(db, "PO")) === "PUR-00100");

  await setLockDate(db, actor, { lockDate: "2026-10-31" });
  await expectError("posting into a closed period is blocked", () => postJournal(db, actor, { date: "2026-10-15", lines: [{ account: ACC.CASH, debit: 1 }, { account: ACC.CAPITAL, credit: 1 }] }), /closed/);
  await postJournal(db, actor, { date: "2026-11-01", lines: [{ account: ACC.CASH, debit: 1 }, { account: ACC.CAPITAL, credit: 1 }] });
  check("posting after the lock date works", true);
  await setLockDate(db, actor, { lockDate: null });
  check("books reopened", (await db.select().from(s.company))[0].lockDate === null);

  console.log("Audit");
  const log = await auditLog(db, {});
  check("admin changes are audited", ["role", "user", "company", "number_series"].every((e) => log.rows.some((x) => x.entity === e)), [...new Set(log.rows.map((x) => x.entity))]);
  const filtered = await auditLog(db, { entity: "role", action: "delete" });
  check("audit filters by entity + action", filtered.rows.length === 1 && filtered.rows[0].summary.includes("Temp"), filtered.rows.length);
  check("audit filter by today's date", (await auditLog(db, { from: "2000-01-01", to: "2100-01-01" })).rows.length === log.rows.length);
  const opts = await auditFilterOptions(db);
  check("audit filter options", opts.entities.includes("role") && opts.actions.includes("lock") && opts.users.length === 2);

  await close();
  done();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
