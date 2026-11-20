/**
 * Test helpers: a throwaway in-memory Postgres with the current schema and base seed data.
 * Module tests call services directly against it, so they never touch .data/pglite.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { DB } from "../src/db/client";
import { ACC, DEFAULT_CHART } from "../src/server/services/chart-of-accounts";

export async function createTestDb(): Promise<{ db: DB; close: () => Promise<void>; actor: { id: string; name: string } }> {
  const client = new PGlite(); // in memory
  const db = drizzle(client, { schema }) as unknown as DB;
  // drizzle-kit's push API diffs the TypeScript schema against the empty database
  const { pushSchema } = await import("drizzle-kit/api");
  const { apply } = await pushSchema(schema, db as never);
  await apply();

  const [role] = await db.insert(schema.roles).values({ name: "Administrator", permissions: ["*"] }).returning();
  const [user] = await db.insert(schema.users).values({ name: "Tester", email: "t@test.local", passwordHash: "x", roleId: role.id }).returning();
  await db.insert(schema.company).values({ id: "default", name: "Test Co" });
  const inserted = await db
    .insert(schema.accounts)
    .values(DEFAULT_CHART.map((a) => ({ code: a.code, name: a.name, type: a.type, subtype: a.subtype ?? null, isGroup: a.group ?? false, isSystem: a.system ?? false })))
    .returning();
  const byCode = new Map(inserted.map((a) => [a.code, a.id]));
  for (const a of DEFAULT_CHART) if (a.parent) await db.update(schema.accounts).set({ parentId: byCode.get(a.parent)! }).where(eq(schema.accounts.code, a.code));
  await db.insert(schema.units).values([
    { code: "pcs", name: "Pieces" },
    { code: "m", name: "Meter", allowFraction: true },
  ]);
  await db.insert(schema.warehouses).values([
    { code: "MAIN", name: "Main", isDefault: true },
    { code: "SHOP", name: "Shop", type: "shop" },
  ]);
  await db.insert(schema.bankAccounts).values([
    { accountId: byCode.get(ACC.CASH)!, name: "Cash", kind: "cash" },
    { accountId: byCode.get(ACC.BANK)!, name: "Bank", kind: "bank" },
  ]);
  await db.insert(schema.pettyCashFunds).values({ name: "Petty", accountId: byCode.get(ACC.PETTY_CASH)!, floatAmount: 10000 });

  return { db, close: () => client.close(), actor: { id: user.id, name: user.name } };
}

export async function makeProduct(db: DB, over: Partial<typeof schema.products.$inferInsert> = {}) {
  const [unit] = await db.select().from(schema.units).where(eq(schema.units.code, "m"));
  const [p] = await db
    .insert(schema.products)
    .values({ sku: `T-${Math.random().toString(36).slice(2, 8)}`, name: "Test Fabric", unitId: unit.id, costPrice: 100, salePrice: 160, ...over })
    .returning();
  return p;
}

export async function warehouseId(db: DB, code = "MAIN") {
  return (await db.select().from(schema.warehouses).where(eq(schema.warehouses.code, code)))[0].id;
}

// Minimal assertion runner with readable output
let failures = 0;
export function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ""}`);
  }
}
export async function expectError(name: string, fn: () => Promise<unknown>, match?: RegExp) {
  try {
    await fn();
    check(name, false, "no error thrown");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(name, !match || match.test(msg), msg);
  }
}
export function done() {
  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}
