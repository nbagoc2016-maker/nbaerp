/**
 * Fills a freshly seeded demo database with about a year of realistic trading for a fabric shop,
 * so dashboards, charts and reports have something to show. Every document goes through the real
 * services (POS sales, credit invoices, receipts, supplier bills, payments, expenses, bank
 * deposits), so the ledger, stock and party balances stay consistent.
 *
 *   SEED_DATE=2025-10-01 tsx scripts/seed.ts --demo
 *   tsx scripts/demo-history.ts --from 2025-10-02 --to 2026-11-10
 *
 * Deterministic: the same dates give the same data.
 */
import { eq } from "drizzle-orm";
import { createDb, type DB } from "../src/db/client";
import * as s from "../src/db/schema";
import { calcDocument } from "../src/lib/doc-calc";
import { round2 } from "../src/lib/format";
import { ACC } from "../src/server/services/chart-of-accounts";
import { createTransfer } from "../src/server/services/finance-banking";
import { createExpense } from "../src/server/services/finance-expenses";
import { postSupplierBill, saveSupplierBill } from "../src/server/services/purchasing-bills";
import { recordSupplierPayment } from "../src/server/services/purchasing-payments";
import { saveInvoice } from "../src/server/services/sales";
import { completePosSale } from "../src/server/services/sales-pos";
import { createReceipt } from "../src/server/services/sales-receipts";
import { zInvoice, zPosSale, zReceipt } from "../src/server/services/sales-schemas";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const FROM = arg("from") as string;
const TO = arg("to") as string;
if (!FROM || !TO) throw new Error("Usage: tsx scripts/demo-history.ts --from YYYY-MM-DD --to YYYY-MM-DD");

// ---- deterministic randomness -----------------------------------------------------------------
let seed = 20261110;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const weighted = <T>(xs: { v: T; w: number }[]): T => {
  let r = rand() * xs.reduce((t, x) => t + x.w, 0);
  for (const x of xs) if ((r -= x.w) <= 0) return x.v;
  return xs[xs.length - 1].v;
};
const poisson = (mean: number) => {
  const L = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
};

// ---- dates ------------------------------------------------------------------------------------
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// Pakistani fabric trade: Eid ul Fitr (20 Mar 2026), Eid ul Adha (27 May 2026), winter and the
// wedding season (Nov–Jan) are busy; Friday is quiet, weekends are busy.
const MONTH_FACTOR = [1.15, 0.9, 1.45, 1.0, 1.3, 0.85, 0.8, 1.0, 0.95, 1.05, 1.25, 1.35];
const EIDS = ["2026-03-20", "2026-05-27"];
function demand(d: string) {
  const month = Number(d.slice(5, 7)) - 1;
  const progress = Math.min(1, Math.max(0, daysBetween(FROM!, d) / Math.max(1, daysBetween(FROM!, TO!))));
  const growth = 0.7 + 0.5 * progress;
  const wd = weekday(d);
  const dayF = wd === 5 ? 0.65 : wd === 6 ? 1.2 : wd === 0 ? 1.3 : 1;
  const eid = EIDS.some((e) => {
    const n = daysBetween(d, e);
    return n >= 0 && n <= 12;
  })
    ? 2.1
    : 1;
  return MONTH_FACTOR[month] * growth * dayF * eid;
}

// ---- main -------------------------------------------------------------------------------------
async function main() {
  const { db, client } = createDb();
  const [admin] = await db.select().from(s.users).where(eq(s.users.email, "admin@shusui.local"));
  const actor = { id: admin.id, name: admin.name };

  const accId = new Map((await db.select().from(s.accounts)).map((a) => [a.code, a.id]));
  const acc = (code: string) => {
    const id = accId.get(code);
    if (!id) throw new Error(`Account ${code} missing`);
    return id;
  };
  const CASH = acc(ACC.CASH);
  const BANK = acc(ACC.BANK);

  const whs = await db.select().from(s.warehouses);
  const MAIN = whs.find((w) => w.code === "MAIN")!.id;
  const SHOP = whs.find((w) => w.code === "SHOP1")!.id;

  const taxById = new Map((await db.select().from(s.taxRates)).map((t) => [t.id, t.rate]));
  const catById = new Map((await db.select().from(s.productCategories)).map((c) => [c.id, c.name]));
  const brandById = new Map((await db.select().from(s.brands)).map((b) => [b.id, b.name]));
  const units = new Map((await db.select().from(s.units)).map((u) => [u.id, u]));
  const products = (await db.select().from(s.products)).map((p) => ({
    ...p,
    cat: p.categoryId ? catById.get(p.categoryId) ?? "" : "",
    brand: p.brandId ? brandById.get(p.brandId) ?? "" : "",
    unitCode: units.get(p.unitId)?.code ?? "",
    fraction: !!units.get(p.unitId)?.allowFraction,
    tax: p.taxRateId ? taxById.get(p.taxRateId) ?? 0 : 0,
  }));
  type Prod = (typeof products)[number];
  const stockItems = products.filter((p) => p.type === "stock");
  const stitching = products.find((p) => p.type === "service");

  const customers = await db.select().from(s.customers);
  const wholesale = customers.filter((c) => c.type !== "retail");
  const retail = customers.filter((c) => c.type === "retail");
  const suppliers = await db.select().from(s.suppliers);
  const supplierFor = (p: Prod) => {
    const by = (needle: string) => suppliers.find((x) => x.name.includes(needle))!;
    if (p.brand === "Gul Ahmed") return by("Gul Ahmed");
    if (p.brand === "Alkaram") return by("Alkaram");
    if (p.cat === "Accessories") return by("Lace");
    return by("Faisalabad");
  };

  // Live stock, kept in step with what the services post
  const stock = new Map<string, number>();
  for (const b of await db.select().from(s.stockBalances)) stock.set(`${b.productId}|${b.warehouseId}`, b.qty);
  const onHand = (p: string, w: string) => stock.get(`${p}|${w}`) ?? 0;
  const bump = (p: string, w: string, q: number) => stock.set(`${p}|${w}`, round2(onHand(p, w) + q));

  // What shoppers buy: how often, and how much per line
  const popularity: Record<string, number> = {
    "Premium Lawn - Floral Print": 9,
    "Swiss Voile - Off White": 4,
    "Wash & Wear - Navy": 8,
    "Egyptian Cotton - White": 5,
    "Pure Silk - Maroon": 2,
    "Chiffon Dupatta Fabric - Peach": 4,
    "Khaddar - Charcoal": 4,
    "Unstitched 3-Piece Lawn Suit": 6,
    "Men's Kurta - Ready-made": 4,
    "Embroidered Lace (per yard)": 5,
    "Buttons - Pearl (dozen)": 3,
  };
  const winterBoost = (p: Prod, d: string) => {
    const m = Number(d.slice(5, 7));
    const winter = m >= 11 || m <= 2;
    if (p.cat === "Khaddar & Winter") return winter ? 3 : 0.3;
    if (p.cat === "Lawn") return winter ? 0.45 : 1.4;
    return 1;
  };
  const retailQty = (p: Prod) => {
    if (p.unitCode === "m" || p.unitCode === "yd") return round2(pick([2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7.5]) * (p.cat === "Accessories" ? 1.5 : 1));
    if (p.unitCode === "dz") return int(1, 4);
    return int(1, 3);
  };
  const wholesaleQty = (p: Prod) => {
    if (p.unitCode === "m" || p.unitCode === "yd") return int(4, 16) * 10;
    if (p.unitCode === "dz") return int(4, 12) * 5;
    return int(5, 25);
  };

  // Money tracking for deposits, bills and receivables
  const openInvoices: { id: string; customerId: string; due: string; total: number }[] = [];
  const openBills: { id: string; supplierId: string; due: string; total: number }[] = [];
  let cashInHand = 250000;
  let bank = 1800000;
  const counts: Record<string, number> = {};
  const errors: Record<string, number> = {};
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const fail = (k: string, e: unknown) => {
    const msg = `${k}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160);
    errors[msg] = (errors[msg] ?? 0) + 1;
  };
  const tx = <T>(fn: (t: DB) => Promise<T>) => db.transaction((t) => fn(t as unknown as DB));
  const costDrift = (d: string) => 1 + 0.06 * (daysBetween(FROM!, d) / 365);

  async function buy(d: string, p: Prod, warehouseId: string, qty: number) {
    const sup = supplierFor(p);
    try {
      const unitCost = Math.round(p.costPrice * costDrift(d) * between(0.97, 1.03));
      const bill = await tx(async (t) => {
        const b = await saveSupplierBill(t, actor, {
          date: d,
          supplierId: sup.id,
          supplierInvoiceNo: `${sup.code}-${int(10000, 99999)}`,
          receivesStock: true,
          warehouseId,
          lines: [{ productId: p.id, description: p.name, qty, price: unitCost, discountPct: 0, taxRate: p.tax }],
        });
        await postSupplierBill(t, actor, { id: b.id });
        const [row] = await t.select().from(s.supplierBills).where(eq(s.supplierBills.id, b.id));
        return row;
      });
      bump(p.id, warehouseId, qty);
      openBills.push({ id: bill.id, supplierId: sup.id, due: addDays(d, sup.paymentTermsDays + int(-3, 8)), total: bill.total });
      count("supplier bills");
    } catch (e) {
      fail("bill", e);
    }
  }

  // Top up anything below its reorder level (shop and main store buy separately)
  async function restock(d: string) {
    for (const p of stockItems) {
      for (const [w, mult] of [
        [SHOP, 1],
        [MAIN, 3],
      ] as const) {
        const level = p.reorderLevel * (w === SHOP ? 0.35 : 1);
        if (onHand(p.id, w) < level) {
          const raw = p.reorderQty * mult * between(0.8, 1.2) * (w === SHOP ? 0.4 : 1);
          const qty = p.fraction ? Math.round(raw / 10) * 10 : Math.max(5, Math.round(raw));
          await buy(d, p, w, qty);
        }
      }
    }
  }

  async function posSale(d: string) {
    const lines: { productId: string; description: string; qty: number; price: number; discountPct: number; taxRate: number }[] = [];
    const nLines = weighted([
      { v: 1, w: 45 },
      { v: 2, w: 32 },
      { v: 3, w: 16 },
      { v: 4, w: 7 },
    ]);
    const used = new Set<string>();
    for (let i = 0; i < nLines; i++) {
      const p = weighted(stockItems.map((x) => ({ v: x, w: (popularity[x.name] ?? 1) * winterBoost(x, d) })));
      if (used.has(p.id)) continue;
      const qty = retailQty(p);
      if (onHand(p.id, SHOP) < qty) continue;
      used.add(p.id);
      const discountPct = rand() < 0.12 ? pick([5, 10]) : 0;
      const ok = p.salePrice * (1 - discountPct / 100) >= p.minSalePrice;
      lines.push({ productId: p.id, description: p.name, qty, price: p.salePrice, discountPct: ok ? discountPct : 0, taxRate: p.tax });
    }
    if (!lines.length) return;
    const suitLine = lines.find((l) => products.find((p) => p.id === l.productId)?.cat === "Lawn" || l.description.includes("Suit"));
    if (stitching && suitLine && rand() < 0.25) lines.push({ productId: stitching.id, description: stitching.name, qty: int(1, 2), price: stitching.salePrice, discountPct: 0, taxRate: 0 });

    const total = calcDocument(lines.map((l) => ({ qty: l.qty, price: l.price, discountPct: l.discountPct, taxRate: l.taxRate }))).total;
    const card = rand() < 0.3;
    const known = rand() < 0.08 ? pick(retail) : null;
    try {
      const input = zPosSale.parse({
        date: d,
        customerId: known?.id ?? null,
        customerName: known ? null : rand() < 0.2 ? pick(["Mrs. Rehman", "Ahsan", "Saima", "Kiran", "Farhan", "Maria", "Asad"]) : null,
        customerPhone: null,
        warehouseId: SHOP,
        lines,
        documentDiscount: 0,
        payments: [card ? { method: "card", accountId: BANK, amount: total, reference: `POS-${int(100000, 999999)}` } : { method: "cash", accountId: CASH, amount: Math.ceil(total / 500) * 500 }],
        notes: null,
      });
      const res = await tx((t) => completePosSale(t, actor, input));
      for (const l of lines) if (l.productId !== stitching?.id) bump(l.productId, SHOP, -l.qty);
      if (card) bank += total;
      else cashInHand += total;
      count("POS sales");
    } catch (e) {
      fail("pos", e);
    }
  }

  async function creditInvoice(d: string) {
    const c = pick(wholesale);
    const lines: { productId: string; description: string; qty: number; price: number; discountPct: number; taxRate: number }[] = [];
    const used = new Set<string>();
    for (let i = 0; i < int(2, 5); i++) {
      const p = weighted(stockItems.map((x) => ({ v: x, w: (popularity[x.name] ?? 1) * winterBoost(x, d) })));
      if (used.has(p.id)) continue;
      const qty = wholesaleQty(p);
      if (onHand(p.id, MAIN) < qty) continue;
      used.add(p.id);
      lines.push({ productId: p.id, description: p.name, qty, price: Math.max(p.wholesalePrice ?? p.salePrice, p.minSalePrice), discountPct: 0, taxRate: p.tax });
    }
    if (!lines.length) return;
    try {
      const input = zInvoice.parse({ date: d, customerId: c.id, warehouseId: MAIN, lines, documentDiscount: 0, charges: 0, post: true });
      const inv = await tx(async (t) => {
        const r = await saveInvoice(t, actor, input);
        const [row] = await t.select().from(s.salesInvoices).where(eq(s.salesInvoices.id, r.id));
        return row;
      });
      for (const l of lines) bump(l.productId, MAIN, -l.qty);
      openInvoices.push({ id: inv.id, customerId: c.id, due: addDays(d, c.paymentTermsDays + int(-5, 12)), total: inv.total });
      count("credit invoices");
    } catch (e) {
      fail("invoice", e);
    }
  }

  async function collect(d: string) {
    for (const inv of openInvoices.filter((i) => i.due <= d)) {
      openInvoices.splice(openInvoices.indexOf(inv), 1);
      if (rand() < 0.05) continue; // a few stay overdue
      const part = rand() < 0.15;
      const amount = round2(part ? inv.total * pick([0.4, 0.5, 0.6]) : inv.total);
      try {
        await tx((t) =>
          createReceipt(t, actor, zReceipt.parse({ date: d, customerId: inv.customerId, method: "bank", depositAccountId: BANK, amount, reference: `IBFT-${int(100000, 999999)}`, allocations: [{ invoiceId: inv.id, amount }] }))
        );
        bank += amount;
        count("customer receipts");
        if (part) openInvoices.push({ ...inv, total: round2(inv.total - amount), due: addDays(d, int(15, 30)) });
      } catch (e) {
        fail("receipt", e);
      }
    }
  }

  async function paySuppliers(d: string) {
    for (const b of openBills.filter((x) => x.due <= d)) {
      if (bank - b.total < 150000) continue; // wait for cash to come in
      openBills.splice(openBills.indexOf(b), 1);
      try {
        await tx((t) =>
          recordSupplierPayment(t, actor, { date: d, supplierId: b.supplierId, method: "bank", paidFromAccountId: BANK, amount: b.total, reference: `CHQ-${int(100000, 999999)}`, allocations: [{ billId: b.id, amount: b.total }] })
        );
        bank -= b.total;
        count("supplier payments");
      } catch (e) {
        fail("payment", e);
      }
    }
  }

  async function expense(d: string, code: string, amount: number, description: string, from: "cash" | "bank", payee?: string) {
    amount = Math.round(amount);
    if (from === "cash" ? cashInHand < amount + 5000 : bank < amount + 50000) return;
    try {
      await tx((t) =>
        createExpense(t, actor, { date: d, expenseAccountId: acc(code), paidFromAccountId: from === "cash" ? CASH : BANK, amount, taxAmount: 0, payee: payee ?? null, supplierId: null, description, reference: null })
      );
      if (from === "cash") cashInHand -= amount;
      else bank -= amount;
      count("expenses");
    } catch (e) {
      fail("expense", e);
    }
  }

  async function depositCash(d: string) {
    const amount = Math.floor((cashInHand - 60000) / 10000) * 10000;
    if (amount < 50000) return;
    try {
      await tx((t) => createTransfer(t, actor, { date: d, fromAccountId: CASH, toAccountId: BANK, amount, reference: `DEP-${d.replaceAll("-", "")}`, notes: "Cash deposited" }));
      cashInHand -= amount;
      bank += amount;
      count("bank deposits");
    } catch (e) {
      fail("deposit", e);
    }
  }

  const monthName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  for (let d: string = FROM; d <= TO; d = addDays(d, 1)) {
    const f = demand(d);
    const isToday = d === TO;
    const day = Number(d.slice(8, 10));
    const wd = weekday(d);

    await collect(d);
    await restock(d);

    const sales = poisson((isToday ? 3 : 7) * f);
    for (let i = 0; i < sales; i++) await posSale(d);
    if (wd !== 5 && rand() < 0.32 * f) await creditInvoice(d);

    // Monthly running costs
    if (day === 1) await expense(d, "6200", 135000, `Shop and godown rent for ${monthName(d)}`, "bank", "Gulberg Properties");
    if (day === 6) await expense(d, "6350", 4500 + int(0, 2) * 500, "Internet and phone bills", "bank", "PTCL");
    if (day === 8) {
      const m = Number(d.slice(5, 7));
      const summer = m >= 5 && m <= 9;
      await expense(d, "6300", between(summer ? 38000 : 16000, summer ? 62000 : 28000), "Electricity bill (LESCO)", "bank", "LESCO");
    }
    if (day === 15) await expense(d, "6850", between(6000, 14000), "Shopping bags and packaging", "cash");
    if (day === 20) await expense(d, "6700", between(350, 1200), "Bank charges", "bank", "Meezan Bank");
    if (day === 28) await expense(d, "6100", 287000 + int(0, 6) * 1000, `Staff salaries for ${monthName(d)}`, "bank");
    if ((day === 3 || day === 18) && rand() < 0.7) await expense(d, "6400", between(2500, 9000), "Loading and delivery charges", "cash");
    if (wd === 2) await expense(d, "6550", between(1500, 3500), "Tea and meals for staff", "cash");
    if (day === 10 && [3, 5, 11, 12].includes(Number(d.slice(5, 7)))) await expense(d, "6650", between(35000, 80000), "Social media ads and banners", "bank", "Meta / local printer");
    if (day === 22 && rand() < 0.25) await expense(d, "6750", between(4000, 18000), "Repairs at the shop", "cash");

    if (wd === 1 || wd === 4) await depositCash(d);
    await paySuppliers(d);
  }

  await client.close();
  console.log("Created:", counts);
  if (Object.keys(errors).length) console.log("Skipped:", errors);
  console.log(`Cash in hand ≈ ${Math.round(cashInHand).toLocaleString()}, bank ≈ ${Math.round(bank).toLocaleString()}, open invoices ${openInvoices.length}, open bills ${openBills.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
