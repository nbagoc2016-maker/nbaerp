// Service tests for the Inventory & Warehouse module (in-memory database).
import { and, eq, sql } from "drizzle-orm";
import * as s from "../src/db/schema";
import type { DB } from "../src/db/client";
import { accountBalance } from "../src/server/services/accounting";
import { ACC } from "../src/server/services/chart-of-accounts";
import {
  createCount,
  deleteTransfer,
  postAdjustment,
  postCount,
  postTransfer,
  saveAdjustment,
  saveCountLines,
  saveTransfer,
  voidAdjustment,
  voidCount,
  voidTransfer,
} from "../src/server/services/inventory";
import {
  adjustmentSchema,
  countCreateSchema,
  productImportSchema,
  productSchema,
  taxRateSchema,
  transferSchema,
  unitSchema,
  warehouseSchema,
  categorySchema,
} from "../src/server/services/inventory-schemas";
import {
  deleteCategory,
  deleteUnit,
  deleteWarehouse,
  saveCategory,
  saveTaxRate,
  saveUnit,
  saveWarehouse,
  deleteTaxRate,
} from "../src/server/services/inventory-setup";
import { createProduct, importProducts, peekSku, setProductActive, updateProduct } from "../src/server/services/products";
import { getBalance } from "../src/server/services/stock";
import { check, createTestDb, done, expectError, makeProduct, warehouseId } from "./test-utils";

const date = "2026-11-05";

async function totals(db: DB, productId: string) {
  const [row] = await db
    .select({
      qty: sql<number>`coalesce(sum(${s.stockBalances.qty}), 0)`.mapWith(Number),
      value: sql<number>`coalesce(sum(${s.stockBalances.qty} * ${s.stockBalances.avgCost}), 0)`.mapWith(Number),
    })
    .from(s.stockBalances)
    .where(eq(s.stockBalances.productId, productId));
  return { qty: Math.round(row.qty * 1000) / 1000, value: Math.round(row.value * 100) / 100 };
}

async function unitId(db: DB, code: string) {
  return (await db.select().from(s.units).where(eq(s.units.code, code)))[0].id;
}

async function main() {
  const { db, close, actor } = await createTestDb();
  const main = await warehouseId(db, "MAIN");
  const shop = await warehouseId(db, "SHOP");
  const metre = await unitId(db, "m");

  console.log("Products: create with opening stock");
  check("SKU preview before first use", (await peekSku(db)) === "P-00001", await peekSku(db));
  const created = await createProduct(
    db,
    actor,
    productSchema.parse({
      sku: "P-00001",
      skuAuto: true,
      name: "Lawn Print",
      unitId: metre,
      costPrice: 500,
      salePrice: 800,
      minSalePrice: 700,
      reorderLevel: 20,
      trackBatches: true,
      openingDate: date,
      opening: [
        { warehouseId: main, unitCost: 500, rolls: [{ batchNo: "R-1", qty: 40 }, { batchNo: "R-2", qty: 35.5, shade: "A" }] },
        { warehouseId: shop, qty: 0 },
      ],
    })
  );
  check("auto SKU reserved", created.sku === "P-00001", created.sku);
  check("SKU preview moves on", (await peekSku(db)) === "P-00002");
  const bal = await getBalance(db, created.id, main);
  check("opening qty = sum of rolls", bal.qty === 75.5, bal.qty);
  check("opening avg cost", bal.avgCost === 500, bal.avgCost);
  const rolls = await db.select().from(s.batches).where(eq(s.batches.productId, created.id));
  check("two rolls created and filled", rolls.length === 2 && rolls.every((r) => r.qty === r.initialQty), rolls.map((r) => [r.batchNo, r.qty]));
  check("inventory GL debited with opening value", (await accountBalance(db, ACC.INVENTORY)) === 37750, await accountBalance(db, ACC.INVENTORY));
  check("opening balance equity credited", (await accountBalance(db, ACC.OPENING_BALANCE)) === 37750);
  const opMoves = await db.select().from(s.stockMovements).where(eq(s.stockMovements.sourceType, "opening"));
  check("opening movements per roll", opMoves.length === 2 && opMoves.every((m) => m.sourceId === created.id));

  await expectError(
    "duplicate SKU rejected",
    () => createProduct(db, actor, productSchema.parse({ sku: "p-00001", name: "Dup", unitId: metre })),
    /already used/
  );
  const pcs = await unitId(db, "pcs");
  await expectError(
    "fractional opening for whole unit rejected",
    () => createProduct(db, actor, productSchema.parse({ sku: "X-1", name: "Buttons", unitId: pcs, opening: [{ warehouseId: main, qty: 2.5, unitCost: 10 }] })),
    /whole number/
  );
  const svc = await createProduct(db, actor, productSchema.parse({ name: "Stitching", type: "service", unitId: pcs, salePrice: 1500, opening: [{ warehouseId: main, qty: 5, unitCost: 1 }] }));
  check("service ignores opening stock", (await totals(db, svc.id)).qty === 0 && svc.openingValue === 0);
  await updateProduct(db, actor, productSchema.parse({ id: created.id, sku: created.sku, name: "Lawn Print (Floral)", unitId: metre, costPrice: 500, salePrice: 850, trackBatches: true }));
  check("update keeps stock", (await getBalance(db, created.id, main)).qty === 75.5);
  await expectError(
    "can't turn a stocked product into a service",
    () => updateProduct(db, actor, productSchema.parse({ id: created.id, sku: created.sku, name: "Lawn", type: "service", unitId: metre })),
    /stock on hand/
  );
  await setProductActive(db, actor, svc.id, false);
  check("deactivate product", (await db.select().from(s.products).where(eq(s.products.id, svc.id)))[0].isActive === false);

  console.log("Transfers");
  const before = await totals(db, created.id);
  const r1 = rolls.find((r) => r.batchNo === "R-1")!;
  const plain = await makeProduct(db, { name: "Plain Cotton" });
  await createProduct(db, actor, productSchema.parse({ name: "noop", unitId: metre })); // keep numbering busy
  // seed plain cotton: 10 @ 100 in MAIN, 10 @ 130 in SHOP so averages differ
  const seedAdj = await saveAdjustment(
    db,
    actor,
    adjustmentSchema.parse({ date, warehouseId: main, reason: "found", lines: [{ productId: plain.id, qtyChange: 10, unitCost: 100 }] })
  );
  await postAdjustment(db, actor, seedAdj.id);
  const seedAdj2 = await saveAdjustment(
    db,
    actor,
    adjustmentSchema.parse({ date, warehouseId: shop, reason: "found", lines: [{ productId: plain.id, qtyChange: 10, unitCost: 130 }] })
  );
  await postAdjustment(db, actor, seedAdj2.id);
  const plainBefore = await totals(db, plain.id);

  const trf = await saveTransfer(
    db,
    actor,
    transferSchema.parse({
      date,
      fromWarehouseId: main,
      toWarehouseId: shop,
      lines: [
        { productId: created.id, batchId: r1.id, qty: 15 },
        { productId: plain.id, qty: 4 },
      ],
    })
  );
  const [trfDoc] = await db.select().from(s.stockTransfers).where(eq(s.stockTransfers.id, trf.id));
  check("transfer numbered and draft", trfDoc.number.startsWith("TRF-") && trfDoc.status === "draft");
  const jeBefore = (await db.select().from(s.journalEntries)).length;
  await postTransfer(db, actor, trf.id);
  const after = await totals(db, created.id);
  check("transfer keeps total qty", after.qty === before.qty, { before, after });
  check("transfer keeps total value", after.value === before.value, { before, after });
  const plainAfter = await totals(db, plain.id);
  const [trfNet] = await db
    .select({ v: sql<number>`coalesce(sum(${s.stockMovements.value}), 0)`.mapWith(Number), n: sql<number>`count(*)`.mapWith(Number) })
    .from(s.stockMovements)
    .where(eq(s.stockMovements.sourceId, trf.id));
  check("transfer movements net to zero value", Math.abs(trfNet.v) < 0.001 && trfNet.n === 4, trfNet);
  // Balances keep a 2-decimal moving average, so re-valuing the blended destination can drift by paisas
  check(
    "transfer keeps value with different averages (within avg-cost rounding)",
    plainAfter.qty === plainBefore.qty && Math.abs(plainAfter.value - plainBefore.value) <= 0.005 * plainAfter.qty,
    { plainBefore, plainAfter }
  );
  const shopPlain = await getBalance(db, plain.id, shop);
  check("destination averages in at source cost", shopPlain.qty === 14 && shopPlain.avgCost === round2((10 * 130 + 4 * 100) / 14), shopPlain);
  check("transfer posts no GL entry", (await db.select().from(s.journalEntries)).length === jeBefore);
  check("plain cotton keeps last purchase cost", (await db.select().from(s.products).where(eq(s.products.id, plain.id)))[0].costPrice === 100);
  const srcRoll = (await db.select().from(s.batches).where(eq(s.batches.id, r1.id)))[0];
  const destRoll = (await db.select().from(s.batches).where(and(eq(s.batches.productId, created.id), eq(s.batches.warehouseId, shop))))[0];
  check("source roll reduced", srcRoll.qty === 25, srcRoll.qty);
  check("destination roll has same number", destRoll?.batchNo === "R-1" && destRoll.qty === 15, destRoll);
  check("shop balance for lawn", (await getBalance(db, created.id, shop)).qty === 15);

  // move part of the roll again: destination batch is reused
  const trf2 = await saveTransfer(db, actor, transferSchema.parse({ date, fromWarehouseId: main, toWarehouseId: shop, lines: [{ productId: created.id, batchId: r1.id, qty: 5 }] }));
  await postTransfer(db, actor, trf2.id);
  const shopRolls = await db.select().from(s.batches).where(and(eq(s.batches.productId, created.id), eq(s.batches.warehouseId, shop)));
  check("existing destination roll reused", shopRolls.length === 1 && shopRolls[0].qty === 20 && shopRolls[0].initialQty === 20, shopRolls);

  const big = await saveTransfer(db, actor, transferSchema.parse({ date, fromWarehouseId: main, toWarehouseId: shop, lines: [{ productId: plain.id, qty: 50 }] }));
  await expectError("can't post transfer exceeding stock", () => postTransfer(db, actor, big.id), /Not enough stock/);
  await expectError("roll can't give more than it has", async () => {
    const t = await saveTransfer(db, actor, transferSchema.parse({ date, fromWarehouseId: main, toWarehouseId: shop, lines: [{ productId: created.id, batchId: r1.id, qty: 30 }] }));
    await postTransfer(db, actor, t.id);
  }, /only has|Not enough/);
  await deleteTransfer(db, actor, big.id);
  check("draft transfer deleted", (await db.select().from(s.stockTransfers).where(eq(s.stockTransfers.id, big.id))).length === 0);
  await expectError("same warehouse rejected", () => saveTransfer(db, actor, transferSchema.parse({ date, fromWarehouseId: main, toWarehouseId: main, lines: [{ productId: plain.id, qty: 1 }] })), /different/);

  console.log("Void transfer");
  await voidTransfer(db, actor, trf2.id, "test");
  check("void transfer returns stock to source", (await getBalance(db, created.id, main)).qty === 75.5 - 15 && (await getBalance(db, created.id, shop)).qty === 15);
  check("void transfer returns roll", (await db.select().from(s.batches).where(eq(s.batches.id, r1.id)))[0].qty === 25);
  check("void keeps total value", (await totals(db, created.id)).value === before.value);
  await expectError("can't void twice", () => voidTransfer(db, actor, trf2.id), /already void/);
  await expectError("can't post a void transfer", () => postTransfer(db, actor, trf2.id), /already been posted or voided/);

  console.log("Adjustments");
  const inv0 = await accountBalance(db, ACC.INVENTORY);
  const adj0 = await accountBalance(db, ACC.INVENTORY_ADJUSTMENT);
  const up = await saveAdjustment(
    db,
    actor,
    adjustmentSchema.parse({ date, warehouseId: main, reason: "found", lines: [{ productId: plain.id, qtyChange: 2 }] }) // default avg cost
  );
  const upRes = await postAdjustment(db, actor, up.id);
  check("increase at average cost", upRes.gain === 200 && upRes.loss === 0, upRes);
  check("increase: Dr Inventory", (await accountBalance(db, ACC.INVENTORY)) === round2(inv0 + 200));
  check("increase: Cr 5200", (await accountBalance(db, ACC.INVENTORY_ADJUSTMENT)) === round2(adj0 - 200));

  const down = await saveAdjustment(
    db,
    actor,
    adjustmentSchema.parse({ date, warehouseId: main, reason: "damage", lines: [{ productId: created.id, batchId: r1.id, qtyChange: -3 }, { productId: plain.id, qtyChange: -1 }] })
  );
  const downRes = await postAdjustment(db, actor, down.id);
  check("decrease at average cost", downRes.loss === 3 * 500 + 100 && downRes.gain === 0, downRes);
  check("decrease: Cr Inventory", (await accountBalance(db, ACC.INVENTORY)) === round2(inv0 + 200 - 1600));
  check("decrease: Dr 5200", (await accountBalance(db, ACC.INVENTORY_ADJUSTMENT)) === round2(adj0 - 200 + 1600));
  check("decrease takes from roll", (await db.select().from(s.batches).where(eq(s.batches.id, r1.id)))[0].qty === 22);
  const [downDoc] = await db.select().from(s.stockAdjustments).where(eq(s.stockAdjustments.id, down.id));
  check("adjustment stores net value and journal", downDoc.totalValue === -1600 && !!downDoc.journalEntryId && downDoc.status === "posted");
  const lines = await db.select().from(s.stockAdjustmentLines).where(eq(s.stockAdjustmentLines.adjustmentId, down.id));
  check("lines record cost used", lines.every((l) => l.unitCost > 0));

  const mixed = await saveAdjustment(
    db,
    actor,
    adjustmentSchema.parse({ date, warehouseId: main, reason: "correction", lines: [{ productId: plain.id, qtyChange: 1, unitCost: 120 }, { productId: created.id, qtyChange: -1 }] })
  );
  const mixedRes = await postAdjustment(db, actor, mixed.id);
  const [mixedJe] = await db.select().from(s.journalEntries).where(eq(s.journalEntries.sourceId, mixed.id));
  const mixedLines = await db.select().from(s.journalLines).where(eq(s.journalLines.entryId, mixedJe.id));
  check("mixed adjustment books both directions", mixedRes.gain === 120 && mixedRes.loss === 500 && mixedLines.length === 4, { mixedRes, n: mixedLines.length });

  console.log("Void adjustment");
  const invBeforeVoid = await accountBalance(db, ACC.INVENTORY);
  const plainQtyBefore = (await getBalance(db, plain.id, main)).qty;
  await voidAdjustment(db, actor, down.id, "entered twice");
  check("void adjustment restores stock", (await getBalance(db, plain.id, main)).qty === plainQtyBefore + 1);
  check("void adjustment restores roll", (await db.select().from(s.batches).where(eq(s.batches.id, r1.id)))[0].qty === 25);
  check("void adjustment reverses GL", (await accountBalance(db, ACC.INVENTORY)) === round2(invBeforeVoid + 1600));
  check("journal marked void", (await db.select().from(s.journalEntries).where(eq(s.journalEntries.id, downDoc.journalEntryId!)))[0].status === "void");
  await expectError("zero quantity line rejected", async () => adjustmentSchema.parse({ date, warehouseId: main, lines: [{ productId: plain.id, qtyChange: 0 }] }), /zero/);

  console.log("Stock counts");
  const lawnMain = await getBalance(db, created.id, main);
  const plainMain = await getBalance(db, plain.id, main);
  const cnt = await createCount(db, actor, countCreateSchema.parse({ date, warehouseId: main }));
  const cLines = await db.select().from(s.stockCountLines).where(eq(s.stockCountLines.countId, cnt.id));
  const [cDoc] = await db.select().from(s.stockCounts).where(eq(s.stockCounts.id, cnt.id));
  check("count starts in counting status", cDoc.status === "counting");
  check("count snapshots every stock product", cLines.length === (await db.select().from(s.products).where(eq(s.products.type, "stock"))).length, cLines.length);
  await expectError("one open count per warehouse", () => createCount(db, actor, countCreateSchema.parse({ date, warehouseId: main })), /still in progress/);
  const lawnLine = cLines.find((l) => l.productId === created.id)!;
  const plainLine = cLines.find((l) => l.productId === plain.id)!;
  check("snapshot system qty", lawnLine.systemQty === lawnMain.qty && plainLine.systemQty === plainMain.qty);
  const others = cLines.filter((l) => l.productId !== created.id && l.productId !== plain.id);
  await saveCountLines(db, actor, {
    id: cnt.id,
    lines: [
      { lineId: lawnLine.id, countedQty: lawnLine.systemQty - 2 }, // short 2
      { lineId: plainLine.id, countedQty: plainLine.systemQty + 3 }, // over 3
      ...others.map((o) => ({ lineId: o.id, countedQty: o.systemQty })), // matches
    ],
  });
  const invBeforeCount = await accountBalance(db, ACC.INVENTORY);
  const movesBefore = (await db.select().from(s.stockMovements)).length;
  const cRes = await postCount(db, actor, cnt.id);
  const movesAfter = (await db.select().from(s.stockMovements)).length;
  check("count posts only the differences", cRes.adjusted === 2 && movesAfter - movesBefore === 2, { cRes, moves: movesAfter - movesBefore });
  check("count brings stock to counted qty", (await getBalance(db, created.id, main)).qty === lawnLine.systemQty - 2 && (await getBalance(db, plain.id, main)).qty === plainLine.systemQty + 3);
  const expectedNet = round2(3 * plainLine.unitCost - 2 * lawnMain.avgCost);
  check("count GL net", (await accountBalance(db, ACC.INVENTORY)) === round2(invBeforeCount + expectedNet), { got: await accountBalance(db, ACC.INVENTORY), expectedNet });
  const countJes = await db.select().from(s.journalEntries).where(eq(s.journalEntries.sourceId, cnt.id));
  check("one GL entry for the count", countJes.length === 1 && countJes[0].sourceType === "stock_count");
  await voidCount(db, actor, cnt.id);
  check("void count restores stock", (await getBalance(db, created.id, main)).qty === lawnLine.systemQty && (await getBalance(db, plain.id, main)).qty === plainLine.systemQty);
  check("void count reverses GL", (await accountBalance(db, ACC.INVENTORY)) === invBeforeCount);
  const cnt2 = await createCount(db, actor, countCreateSchema.parse({ date, warehouseId: main }));
  await expectError("can't post an empty count", () => postCount(db, actor, cnt2.id), /at least one/);
  await voidCount(db, actor, cnt2.id);

  console.log("Import");
  const imp = await importProducts(
    db,
    actor,
    productImportSchema.parse({
      date,
      rows: [
        { name: "Imported Voile", unit: "m", cost: 200, sale: 350, category: "Voile", brand: "Acme", openingQty: 10 },
        { name: "Bad Unit", unit: "kg" },
        { name: "Dup", sku: created.sku, unit: "m" },
        { name: "Shop Buttons", unit: "pcs", cost: 5, openingQty: 100, openingWarehouse: "SHOP" },
      ],
    })
  );
  check("import creates valid rows", imp.created === 2 && imp.skipped.length === 2, imp);
  check("import opening value", imp.openingValue === 2500, imp.openingValue);
  check("import created category", (await db.select().from(s.productCategories).where(eq(s.productCategories.name, "Voile"))).length === 1);

  console.log("Setup masters");
  const wh = await saveWarehouse(db, actor, warehouseSchema.parse({ code: "tr1", name: "In Transit", type: "transit", isDefault: true }));
  const whs = await db.select().from(s.warehouses);
  check("exactly one default warehouse", whs.filter((w) => w.isDefault).length === 1 && whs.find((w) => w.isDefault)!.id === wh.id);
  check("warehouse code upper-cased", whs.find((w) => w.id === wh.id)!.code === "TR1");
  await expectError("default warehouse can't be deleted", () => deleteWarehouse(db, actor, wh.id), /default/);
  await expectError("warehouse with history can't be deleted", () => deleteWarehouse(db, actor, shop), /history/);
  await saveWarehouse(db, actor, warehouseSchema.parse({ id: main, code: "MAIN", name: "Main", isDefault: true }));
  await deleteWarehouse(db, actor, wh.id);
  check("unused warehouse deleted", (await db.select().from(s.warehouses).where(eq(s.warehouses.id, wh.id))).length === 0);
  await expectError("unit in use can't be deleted", () => deleteUnit(db, actor, metre), /used by/);
  const kg = await saveUnit(db, actor, unitSchema.parse({ code: "KG", name: "Kilogram", allowFraction: true }));
  await deleteUnit(db, actor, kg.id);
  const voileCat = (await db.select().from(s.productCategories).where(eq(s.productCategories.name, "Voile")))[0];
  await expectError("category in use can't be deleted", () => deleteCategory(db, actor, voileCat.id), /used by/);
  const parent = await saveCategory(db, actor, categorySchema.parse({ name: "Fabric" }));
  const child = await saveCategory(db, actor, categorySchema.parse({ name: "Silk", parentId: parent.id }));
  await expectError("category loop rejected", () => saveCategory(db, actor, categorySchema.parse({ id: parent.id, name: "Fabric", parentId: child.id })), /itself/);
  await expectError("category with children can't be deleted", () => deleteCategory(db, actor, parent.id), /sub-categor/);
  const t0 = await saveTaxRate(db, actor, taxRateSchema.parse({ name: "No tax", rate: 0 }));
  const t18 = await saveTaxRate(db, actor, taxRateSchema.parse({ name: "GST 18%", rate: 18, isDefault: true }));
  const rates = await db.select().from(s.taxRates);
  check("one default tax rate", rates.filter((r) => r.isDefault).length === 1 && rates.find((r) => r.isDefault)!.id === t18.id);
  await expectError("default tax rate can't be deleted", () => deleteTaxRate(db, actor, t18.id), /default/);
  await deleteTaxRate(db, actor, t0.id);

  const audit = await db.select().from(s.auditLogs);
  check("audit trail written", audit.some((a) => a.entity === "stock_transfer" && a.action === "post") && audit.some((a) => a.entity === "stock_count" && a.action === "void"));

  await close();
  done();
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
