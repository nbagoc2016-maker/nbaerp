import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Seeds a fresh local database.
 *   npm run db:seed            -> base setup (roles, admin, chart of accounts, units, warehouses…)
 *   npm run db:seed -- --demo  -> plus demo products, parties, employees and opening balances
 *
 * Local development credentials (change them in Settings > Users before real use):
 *   admin@shusui.local / Admin@12345
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDb, type DB } from "../src/db/client";
import * as s from "../src/db/schema";
import { DEFAULT_ROLES } from "../src/lib/permissions";
import { today } from "../src/lib/format";
import { postJournal } from "../src/server/services/accounting";
import { ACC, DEFAULT_CHART } from "../src/server/services/chart-of-accounts";
import { nextNumber } from "../src/server/services/numbering";
import { moveStock } from "../src/server/services/stock";

const SYSTEM = { id: "", name: "Seed" };

async function seedBase(db: DB) {
  await db
    .insert(s.company)
    .values({
      id: "default",
      name: "Shusui Demo Traders",
      legalName: "Shusui Demo Traders (Pvt) Ltd",
      tagline: "Fabrics & Lifestyle",
      address: "12-B Main Boulevard, Gulberg III",
      city: "Lahore",
      phone: "+92 42 3500 0000",
      email: "accounts@shusui.local",
      currency: "PKR",
      currencySymbol: "Rs",
      fiscalYearStartMonth: 7,
      invoiceFooter: "Thank you for your business. Goods once sold can be exchanged within 7 days with receipt.",
    })
    .onConflictDoNothing();

  const roleIds: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const [row] = await db
      .insert(s.roles)
      .values({ name: r.name, description: r.description, permissions: r.permissions, isSystem: r.name === "Administrator" })
      .onConflictDoNothing()
      .returning();
    roleIds[r.name] = row?.id ?? (await db.select().from(s.roles).where(eq(s.roles.name, r.name)))[0].id;
  }

  const [admin] = await db
    .insert(s.users)
    .values({
      name: "Admin",
      email: "admin@shusui.local",
      passwordHash: await bcrypt.hash("Admin@12345", 10),
      roleId: roleIds.Administrator,
    })
    .onConflictDoNothing()
    .returning();
  SYSTEM.id = admin?.id ?? (await db.select().from(s.users).where(eq(s.users.email, "admin@shusui.local")))[0].id;
  SYSTEM.name = "Admin";

  // Chart of accounts: insert all, then link parents by code
  const existing = await db.select().from(s.accounts);
  if (existing.length === 0) {
    const inserted = await db
      .insert(s.accounts)
      .values(
        DEFAULT_CHART.map((a) => ({
          code: a.code,
          name: a.name,
          type: a.type,
          subtype: a.subtype ?? null,
          isGroup: a.group ?? false,
          isSystem: a.system ?? false,
        }))
      )
      .returning();
    const byCode = new Map(inserted.map((a) => [a.code, a.id]));
    for (const a of DEFAULT_CHART) {
      if (a.parent) await db.update(s.accounts).set({ parentId: byCode.get(a.parent)! }).where(eq(s.accounts.code, a.code));
    }
  }
  const acc = async (code: string) => (await db.select().from(s.accounts).where(eq(s.accounts.code, code)))[0];

  await db
    .insert(s.units)
    .values([
      { code: "pcs", name: "Pieces", allowFraction: false },
      { code: "m", name: "Meter", allowFraction: true },
      { code: "yd", name: "Yard", allowFraction: true },
      { code: "kg", name: "Kilogram", allowFraction: true },
      { code: "suit", name: "Suit", allowFraction: false },
      { code: "box", name: "Box", allowFraction: false },
      { code: "dz", name: "Dozen", allowFraction: true },
    ])
    .onConflictDoNothing();

  if ((await db.select().from(s.taxRates)).length === 0) {
    await db.insert(s.taxRates).values([
      { name: "No tax", rate: 0, isDefault: true },
      { name: "GST 18%", rate: 18 },
      { name: "Reduced 5%", rate: 5 },
    ]);
  }

  await db
    .insert(s.warehouses)
    .values([
      { code: "MAIN", name: "Main Warehouse", type: "warehouse", address: "Plot 44, Sundar Industrial Estate", isDefault: true },
      { code: "SHOP1", name: "Gulberg Shop", type: "shop", address: "12-B Main Boulevard, Gulberg III" },
    ])
    .onConflictDoNothing();

  const cash = await acc(ACC.CASH);
  const bank = await acc(ACC.BANK);
  const petty = await acc(ACC.PETTY_CASH);
  await db
    .insert(s.bankAccounts)
    .values([
      { accountId: cash.id, name: "Cash in Hand", kind: "cash" },
      { accountId: bank.id, name: "Meezan Bank - Current", kind: "bank", bankName: "Meezan Bank", accountTitle: "Shusui Demo Traders", accountNumber: "0101-0000000-01", branch: "Gulberg" },
    ])
    .onConflictDoNothing();
  await db.insert(s.pettyCashFunds).values({ name: "Main Petty Cash", accountId: petty.id, custodianName: "Store Manager", floatAmount: 20000 }).onConflictDoNothing();

  await db
    .insert(s.departments)
    .values([{ name: "Sales" }, { name: "Store" }, { name: "Accounts" }, { name: "Administration" }])
    .onConflictDoNothing();
  await db
    .insert(s.leaveTypes)
    .values([
      { name: "Annual Leave", daysPerYear: 14, isPaid: true },
      { name: "Sick Leave", daysPerYear: 10, isPaid: true },
      { name: "Unpaid Leave", daysPerYear: 0, isPaid: false },
    ])
    .onConflictDoNothing();

  if ((await db.select().from(s.productCategories)).length === 0) {
    const [fabric] = await db.insert(s.productCategories).values({ name: "Fabric" }).returning();
    await db.insert(s.productCategories).values([
      { name: "Cotton", parentId: fabric.id },
      { name: "Lawn", parentId: fabric.id },
      { name: "Silk & Chiffon", parentId: fabric.id },
      { name: "Khaddar & Winter", parentId: fabric.id },
      { name: "Ready-made" },
      { name: "Accessories" },
      { name: "Services" },
    ]);
  }
}

async function seedDemo(db: DB) {
  if ((await db.select().from(s.products)).length > 0) {
    console.log("Demo data already present, skipping");
    return;
  }
  // SEED_DATE backdates the opening balances, so scripts/demo-history.ts can add trading after it
  const date = process.env.SEED_DATE ?? today();
  const cats = new Map((await db.select().from(s.productCategories)).map((c) => [c.name, c.id]));
  const units = new Map((await db.select().from(s.units)).map((u) => [u.code, u.id]));
  const [main] = await db.select().from(s.warehouses).where(eq(s.warehouses.code, "MAIN"));
  const [shop] = await db.select().from(s.warehouses).where(eq(s.warehouses.code, "SHOP1"));
  const [gst] = await db.select().from(s.taxRates).where(eq(s.taxRates.rate, 18));

  await db.insert(s.brands).values([{ name: "Gul Ahmed" }, { name: "Alkaram" }, { name: "Sapphire" }, { name: "House Brand" }]).onConflictDoNothing();
  const brands = new Map((await db.select().from(s.brands)).map((b) => [b.name, b.id]));

  type P = { name: string; cat: string; unit: string; cost: number; price: number; min: number; brand?: string; qtyMain: number; qtyShop: number; reorder: number; batches?: boolean; color?: string; material?: string; type?: "stock" | "service"; tax?: boolean };
  const items: P[] = [
    { name: "Premium Lawn - Floral Print", cat: "Lawn", unit: "m", cost: 520, price: 850, min: 720, brand: "Gul Ahmed", qtyMain: 640, qtyShop: 180, reorder: 150, batches: true, color: "Multi", material: "Cotton Lawn" },
    { name: "Swiss Voile - Off White", cat: "Lawn", unit: "m", cost: 690, price: 1150, min: 980, brand: "Alkaram", qtyMain: 320, qtyShop: 90, reorder: 100, batches: true, color: "Off White", material: "Voile" },
    { name: "Wash & Wear - Navy", cat: "Cotton", unit: "m", cost: 380, price: 620, min: 540, brand: "House Brand", qtyMain: 900, qtyShop: 240, reorder: 200, batches: true, color: "Navy", material: "Poly-Cotton" },
    { name: "Egyptian Cotton - White", cat: "Cotton", unit: "m", cost: 610, price: 980, min: 860, brand: "Sapphire", qtyMain: 410, qtyShop: 120, reorder: 120, batches: true, color: "White", material: "Cotton" },
    { name: "Pure Silk - Maroon", cat: "Silk & Chiffon", unit: "m", cost: 1450, price: 2400, min: 2100, qtyMain: 140, qtyShop: 35, reorder: 40, batches: true, color: "Maroon", material: "Silk" },
    { name: "Chiffon Dupatta Fabric - Peach", cat: "Silk & Chiffon", unit: "m", cost: 430, price: 750, min: 640, qtyMain: 260, qtyShop: 60, reorder: 80, color: "Peach", material: "Chiffon" },
    { name: "Khaddar - Charcoal", cat: "Khaddar & Winter", unit: "m", cost: 470, price: 790, min: 690, brand: "Alkaram", qtyMain: 380, qtyShop: 70, reorder: 100, batches: true, color: "Charcoal", material: "Khaddar" },
    { name: "Unstitched 3-Piece Lawn Suit", cat: "Ready-made", unit: "suit", cost: 3100, price: 4990, min: 4500, brand: "Gul Ahmed", qtyMain: 85, qtyShop: 30, reorder: 25, tax: true },
    { name: "Men's Kurta - Ready-made", cat: "Ready-made", unit: "pcs", cost: 1650, price: 2850, min: 2500, brand: "House Brand", qtyMain: 60, qtyShop: 22, reorder: 20, tax: true },
    { name: "Embroidered Lace (per yard)", cat: "Accessories", unit: "yd", cost: 95, price: 180, min: 150, qtyMain: 1200, qtyShop: 300, reorder: 300 },
    { name: "Buttons - Pearl (dozen)", cat: "Accessories", unit: "dz", cost: 60, price: 120, min: 100, qtyMain: 400, qtyShop: 80, reorder: 100 },
    { name: "Stitching Service", cat: "Services", unit: "suit", cost: 0, price: 1500, min: 1200, qtyMain: 0, qtyShop: 0, reorder: 0, type: "service" },
  ];

  let openingValue = 0;
  for (const it of items) {
    const sku = await nextNumber(db, "SKU");
    const [p] = await db
      .insert(s.products)
      .values({
        sku,
        barcode: `89600${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
        name: it.name,
        type: it.type ?? "stock",
        categoryId: cats.get(it.cat) ?? null,
        brandId: it.brand ? brands.get(it.brand) ?? null : null,
        unitId: units.get(it.unit)!,
        taxRateId: it.tax ? gst.id : null,
        costPrice: it.cost,
        salePrice: it.price,
        minSalePrice: it.min,
        wholesalePrice: Math.round(it.price * 0.9),
        reorderLevel: it.reorder,
        reorderQty: it.reorder * 2,
        trackBatches: it.batches ?? false,
        color: it.color ?? null,
        material: it.material ?? null,
      })
      .returning();
    if (p.type !== "stock") continue;
    for (const [wh, q] of [
      [main, it.qtyMain],
      [shop, it.qtyShop],
    ] as const) {
      if (!q) continue;
      const res = await moveStock(db, SYSTEM, {
        date,
        productId: p.id,
        warehouseId: wh.id,
        qty: q,
        unitCost: it.cost,
        sourceType: "opening",
        sourceNumber: "Opening stock",
      });
      openingValue += res.value;
    }
  }

  // Opening balances: stock against Opening Balance Equity; cash & bank against Owner's Capital
  await postJournal(db, SYSTEM, {
    date,
    memo: "Opening stock",
    sourceType: "opening",
    lines: [
      { account: ACC.INVENTORY, debit: openingValue },
      { account: ACC.OPENING_BALANCE, credit: openingValue },
    ],
  });
  await postJournal(db, SYSTEM, {
    date,
    memo: "Owner's capital introduced",
    sourceType: "opening",
    lines: [
      { account: ACC.CASH, debit: 250000 },
      { account: ACC.BANK, debit: 1800000 },
      { account: ACC.PETTY_CASH, debit: 20000 },
      { account: ACC.CAPITAL, credit: 2070000 },
    ],
  });

  const customers = [
    { name: "Ayesha Boutique", type: "wholesale" as const, phone: "0300-1112233", city: "Lahore", creditLimit: 500000, terms: 30 },
    { name: "Nadia Khan", type: "retail" as const, phone: "0321-4455667", city: "Lahore", creditLimit: 50000, terms: 0 },
    { name: "Zara Fashion House", type: "wholesale" as const, phone: "0333-9988776", city: "Karachi", creditLimit: 800000, terms: 45 },
    { name: "Hamza Tailors", type: "corporate" as const, phone: "0345-1234567", city: "Faisalabad", creditLimit: 300000, terms: 30 },
    { name: "Sana Ahmed", type: "retail" as const, phone: "0312-7654321", city: "Lahore", creditLimit: 0, terms: 0 },
    { name: "Elegance Studio", type: "wholesale" as const, phone: "0301-5566778", city: "Islamabad", creditLimit: 600000, terms: 30 },
  ];
  for (const c of customers) {
    await db.insert(s.customers).values({
      code: await nextNumber(db, "CUST"),
      name: c.name,
      type: c.type,
      priceLevel: c.type === "wholesale" ? "wholesale" : "retail",
      phone: c.phone,
      city: c.city,
      creditLimit: c.creditLimit,
      paymentTermsDays: c.terms,
    });
  }

  const suppliers = [
    { name: "Gul Ahmed Textile Mills", city: "Karachi", phone: "021-3500 1111", terms: 30 },
    { name: "Alkaram Studio Wholesale", city: "Karachi", phone: "021-3500 2222", terms: 45 },
    { name: "Faisalabad Weaving Co.", city: "Faisalabad", phone: "041-870 3333", terms: 30 },
    { name: "Lace & Trims Traders", city: "Lahore", phone: "042-3700 4444", terms: 15 },
  ];
  for (const sp of suppliers) {
    await db.insert(s.suppliers).values({
      code: await nextNumber(db, "SUPP"),
      name: sp.name,
      city: sp.city,
      phone: sp.phone,
      paymentTermsDays: sp.terms,
    });
  }

  const depts = new Map((await db.select().from(s.departments)).map((d) => [d.name, d.id]));
  const staff = [
    { name: "Bilal Ahmed", dept: "Sales", designation: "Sales Lead", basic: 65000, allowances: 8000, commission: 1 },
    { name: "Fatima Noor", dept: "Sales", designation: "Sales Associate", basic: 42000, allowances: 5000, commission: 0.5 },
    { name: "Usman Tariq", dept: "Store", designation: "Storekeeper", basic: 45000, allowances: 5000, commission: 0 },
    { name: "Hira Saleem", dept: "Accounts", designation: "Accountant", basic: 70000, allowances: 7000, commission: 0 },
    { name: "Ali Raza", dept: "Store", designation: "Helper", basic: 32000, allowances: 3000, commission: 0 },
  ];
  for (const e of staff) {
    await db.insert(s.employees).values({
      code: await nextNumber(db, "EMP"),
      name: e.name,
      departmentId: depts.get(e.dept) ?? null,
      designation: e.designation,
      joinDate: "2025-01-15",
      basicSalary: e.basic,
      allowances: e.allowances,
      commissionPct: e.commission,
      phone: "03xx-xxxxxxx",
    });
  }

  console.log(`Demo data: ${items.length} products (opening stock value ${openingValue.toLocaleString()}), ${customers.length} customers, ${suppliers.length} suppliers, ${staff.length} employees`);
}

async function main() {
  const { db, client } = createDb();
  await db.transaction(async (tx) => {
    await seedBase(tx as unknown as DB);
    if (process.argv.includes("--demo")) await seedDemo(tx as unknown as DB);
  });
  await client.close();
  console.log("Seed complete. Sign in with admin@shusui.local (password in scripts/seed.ts header).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
