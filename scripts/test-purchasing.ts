// Purchasing module tests: PO -> GRN -> bill -> payment -> return, with rolls, variances and voids.
import { and, eq, sql } from "drizzle-orm";
import * as s from "../src/db/schema";
import { accountBalance, partyBalance, postJournal } from "../src/server/services/accounting";
import { ACC } from "../src/server/services/chart-of-accounts";
import { getBalance, moveStock } from "../src/server/services/stock";
import { createSupplier, updateSupplier } from "../src/server/services/suppliers";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  markPurchaseOrderSent,
  postGoodsReceipt,
  remainingToReceive,
  saveGoodsReceipt,
  savePurchaseOrder,
  voidGoodsReceipt,
} from "../src/server/services/purchasing";
import { postSupplierBill, saveSupplierBill, voidSupplierBill } from "../src/server/services/purchasing-bills";
import {
  postPurchaseReturn,
  recordSupplierPayment,
  savePurchaseReturn,
  voidPurchaseReturn,
  voidSupplierPayment,
} from "../src/server/services/purchasing-payments";
import { allocateOldestFirst } from "../src/server/services/purchasing-schemas";
import type { DB } from "../src/db/client";
import { check, createTestDb, done, expectError, makeProduct, warehouseId } from "./test-utils";

const near = (a: number, b: number, eps = 0.011) => Math.abs(a - b) < eps;

async function main() {
  const { db, close, actor } = await createTestDb();
  const date = "2026-11-05";
  const wh = await warehouseId(db);
  const accId = async (code: string) => (await db.select().from(s.accounts).where(eq(s.accounts.code, code)))[0].id;
  const po = async (id: string) => (await db.select().from(s.purchaseOrders).where(eq(s.purchaseOrders.id, id)))[0];
  const poLines = (id: string) => db.select().from(s.purchaseOrderLines).where(eq(s.purchaseOrderLines.orderId, id)).orderBy(s.purchaseOrderLines.lineNo);
  const grn = async (id: string) => (await db.select().from(s.goodsReceipts).where(eq(s.goodsReceipts.id, id)))[0];
  const grnLines = (id: string) => db.select().from(s.goodsReceiptLines).where(eq(s.goodsReceiptLines.receiptId, id));
  const bill = async (id: string) => (await db.select().from(s.supplierBills).where(eq(s.supplierBills.id, id)))[0];
  const billLines = (id: string) => db.select().from(s.supplierBillLines).where(eq(s.supplierBillLines.billId, id)).orderBy(s.supplierBillLines.lineNo);

  console.log("Suppliers");
  const sup = await createSupplier(db, actor, { name: "Gul Ahmed Textile", paymentTermsDays: 30, openingBalance: 5000, openingDate: "2026-10-01" });
  check("opening balance owed to supplier", (await partyBalance(db, "supplier", sup.id)) === 5000);
  check("opening balance equity debited", (await accountBalance(db, ACC.OPENING_BALANCE)) === -5000);
  await updateSupplier(db, actor, { id: sup.id, name: "Gul Ahmed Textile Mills", paymentTermsDays: 30, openingBalance: 6000 });
  check("changing opening balance replaces the journal", (await partyBalance(db, "supplier", sup.id)) === 6000);
  await updateSupplier(db, actor, { id: sup.id, name: "Gul Ahmed Textile Mills", paymentTermsDays: 30, openingBalance: 5000 });
  check("editing other fields doesn't post again", (await partyBalance(db, "supplier", sup.id)) === 5000);
  const other = await createSupplier(db, actor, { name: "Other Supplier" });
  check("supplier codes are numbered", (await db.select().from(s.suppliers)).every((x) => x.code.startsWith("S-")));

  const lawn = await makeProduct(db, { name: "Lawn", costPrice: 100 });
  const silk = await makeProduct(db, { name: "Silk (rolls)", trackBatches: true, costPrice: 200 });
  const service = await makeProduct(db, { name: "Stitching service", type: "service", costPrice: 0 });
  // Some stock on hand before purchasing so moving average is visible
  await moveStock(db, actor, { date, productId: lawn.id, warehouseId: wh, qty: 10, unitCost: 100, sourceType: "opening" });

  console.log("Purchase orders");
  const order = await savePurchaseOrder(db, actor, {
    date,
    expectedDate: "2026-11-20",
    supplierId: sup.id,
    warehouseId: wh,
    lines: [
      { productId: lawn.id, description: "Lawn", qty: 100, price: 120, discountPct: 0, taxRate: 0 },
      { productId: silk.id, description: "Silk", qty: 119.7, price: 200, discountPct: 0, taxRate: 0 },
    ],
  });
  let o = await po(order.id);
  check("PO total recomputed on server", o.total === 12000 + 23940, o.total);
  check("PO starts as draft", o.status === "draft");
  await expectError("can't receive against a draft PO", () =>
    saveGoodsReceipt(db, actor, { date, supplierId: sup.id, warehouseId: wh, purchaseOrderId: order.id, lines: [{ productId: lawn.id, description: "Lawn", qty: 1, unitCost: 120 }] }), /draft/);
  await approvePurchaseOrder(db, actor, { id: order.id });
  await markPurchaseOrderSent(db, actor, { id: order.id });
  check("PO approved then sent", (await po(order.id)).status === "sent");
  await expectError("approved PO can't be edited", () =>
    savePurchaseOrder(db, actor, { id: order.id, date, supplierId: sup.id, warehouseId: wh, lines: [{ productId: lawn.id, description: "x", qty: 1, price: 1, discountPct: 0, taxRate: 0 }] }), /draft/);
  const pl = await poLines(order.id);

  console.log("Goods receipts");
  const g1 = await saveGoodsReceipt(db, actor, {
    date,
    supplierId: sup.id,
    warehouseId: wh,
    purchaseOrderId: order.id,
    supplierDeliveryRef: "DC-881",
    lines: [{ purchaseOrderLineId: pl[0].id, productId: lawn.id, description: "Lawn", qty: 60, unitCost: 120 }],
  });
  await expectError("receipt for another supplier's PO rejected", () =>
    saveGoodsReceipt(db, actor, { date, supplierId: other.id, warehouseId: wh, purchaseOrderId: order.id, lines: [{ productId: lawn.id, description: "Lawn", qty: 1, unitCost: 1 }] }), /another supplier/);
  await postGoodsReceipt(db, actor, { id: g1.id });
  const bal = await getBalance(db, lawn.id, wh);
  check("GRN puts stock in", bal.qty === 70, bal.qty);
  check("moving average after GRN", near(bal.avgCost, 117.14), bal.avgCost);
  check("GRN Dr Inventory", (await accountBalance(db, ACC.INVENTORY)) === 7200);
  check("GRN Cr GRNI", (await accountBalance(db, ACC.GRNI)) === 7200);
  check("GRN doesn't touch supplier balance", (await partyBalance(db, "supplier", sup.id)) === 5000);
  o = await po(order.id);
  check("PO partial after first GRN", o.status === "partial", o.status);
  check("PO received qty updated", (await poLines(order.id))[0].receivedQty === 60);
  const rem = await remainingToReceive(db, order.id);
  check("remaining qty for next GRN", rem[0].remaining === 40 && rem[1].remaining === 119.7, rem.map((r) => r.remaining));

  await expectError("rolls must add up to the line qty", () =>
    saveGoodsReceipt(db, actor, {
      date, supplierId: sup.id, warehouseId: wh, purchaseOrderId: order.id,
      lines: [{ purchaseOrderLineId: pl[1].id, productId: silk.id, description: "Silk", qty: 100, unitCost: 200, rolls: [{ batchNo: "R1", qty: 38.5 }] }],
    }), /add up/);
  const g2 = await saveGoodsReceipt(db, actor, {
    date,
    supplierId: sup.id,
    warehouseId: wh,
    purchaseOrderId: order.id,
    lines: [
      { purchaseOrderLineId: pl[0].id, productId: lawn.id, description: "Lawn", qty: 40, unitCost: 120 },
      {
        purchaseOrderLineId: pl[1].id,
        productId: silk.id,
        description: "Silk",
        qty: 119.7,
        unitCost: 200,
        rolls: [
          { batchNo: "R-101", qty: 38.5 },
          { batchNo: "R-102", qty: 40 },
          { batchNo: "", qty: 41.2 },
        ],
      },
    ],
  });
  check("each roll stored as its own receipt line", (await grnLines(g2.id)).length === 4);
  await postGoodsReceipt(db, actor, { id: g2.id });
  const rolls = await db.select().from(s.batches).where(eq(s.batches.productId, silk.id)).orderBy(s.batches.batchNo);
  check("three rolls created", rolls.length === 3, rolls.length);
  check("roll lengths kept", rolls.map((r) => r.qty).sort().join() === [38.5, 40, 41.2].sort().join(), rolls.map((r) => r.qty));
  check("blank roll number auto-assigned", rolls.some((r) => r.batchNo.startsWith("GRN-")), rolls.map((r) => r.batchNo));
  check("silk stock = sum of rolls", (await getBalance(db, silk.id, wh)).qty === 119.7);
  const moves = await db.select().from(s.stockMovements).where(and(eq(s.stockMovements.sourceType, "goods_receipt"), eq(s.stockMovements.sourceId, g2.id)));
  check("stock movements carry the batch id", moves.filter((m) => m.batchId).length === 3, moves.length);
  check("PO received after second GRN", (await po(order.id)).status === "received", (await po(order.id)).status);
  check("GRNI holds both receipts", (await accountBalance(db, ACC.GRNI)) === 7200 + 4800 + 23940);
  await expectError("duplicate roll number rejected", async () => {
    const o2 = await savePurchaseOrder(db, actor, { date, supplierId: sup.id, warehouseId: wh, lines: [{ productId: silk.id, description: "Silk", qty: 5, price: 200, discountPct: 0, taxRate: 0 }] });
    await approvePurchaseOrder(db, actor, { id: o2.id });
    const g = await saveGoodsReceipt(db, actor, { date, supplierId: sup.id, warehouseId: wh, lines: [{ productId: silk.id, description: "Silk", qty: 5, unitCost: 200, rolls: [{ batchNo: "R-101", qty: 5 }] }] });
    await postGoodsReceipt(db, actor, { id: g.id });
  }, /already exists/);
  await expectError("cancel refused once goods are received", () => cancelPurchaseOrder(db, actor, { id: order.id }), /Close it/);

  console.log("Supplier bills");
  const g1Line = (await grnLines(g1.id))[0];
  const b1 = await saveSupplierBill(db, actor, {
    date,
    supplierId: sup.id,
    supplierInvoiceNo: "GA-5521",
    goodsReceiptId: g1.id,
    purchaseOrderId: order.id,
    charges: 200,
    lines: [{ productId: lawn.id, description: "Lawn", qty: 60, price: 125, discountPct: 0, taxRate: 10, goodsReceiptLineId: g1Line.id }],
  });
  let b = await bill(b1.id);
  check("bill total = net + tax + freight", b.total === 7500 + 750 + 200, b.total);
  check("due date from supplier terms", b.dueDate === "2026-12-05", b.dueDate);
  check("bill links PO line from the GRN line", (await billLines(b1.id))[0].purchaseOrderLineId === pl[0].id);
  await postSupplierBill(db, actor, { id: b1.id });
  check("bill clears GRNI at receipt value", (await accountBalance(db, ACC.GRNI)) === 4800 + 23940);
  check("price variance to Inventory", (await accountBalance(db, ACC.INVENTORY)) === 7200 + 28740 + 300);
  check("input tax debited", (await accountBalance(db, ACC.INPUT_TAX)) === 750);
  check("freight to Freight In 5300", (await accountBalance(db, "5300")) === 200);
  check("payable created for supplier", (await partyBalance(db, "supplier", sup.id)) === 5000 + 8450);
  check("GRN marked billed", (await grn(g1.id)).billStatus === "billed");
  check("PO billed qty updated", (await poLines(order.id))[0].billedQty === 60);
  check("new bill is unpaid", (await bill(b1.id)).paymentStatus === "unpaid");
  await expectError("can't bill more than received", async () => {
    const x = await saveSupplierBill(db, actor, {
      date, supplierId: sup.id, goodsReceiptId: g1.id,
      lines: [{ productId: lawn.id, description: "Lawn", qty: 1, price: 120, discountPct: 0, taxRate: 0, goodsReceiptLineId: g1Line.id }],
    });
    await postSupplierBill(db, actor, { id: x.id });
  }, /unbilled/);
  await expectError("GRN can't be voided once billed", () => voidGoodsReceipt(db, actor, { id: g1.id }), /billed/);

  // Bill part of the silk rolls (aggregated into one bill line for the roll group)
  const silkLine = (await grnLines(g2.id)).find((l) => l.productId === silk.id)!;
  const b2 = await saveSupplierBill(db, actor, {
    date,
    supplierId: sup.id,
    goodsReceiptId: g2.id,
    lines: [{ productId: silk.id, description: "Silk", qty: 50, price: 200, discountPct: 0, taxRate: 0, goodsReceiptLineId: silkLine.id }],
  });
  await postSupplierBill(db, actor, { id: b2.id });
  const silkBilled = (await grnLines(g2.id)).filter((l) => l.productId === silk.id).reduce((t, l) => t + l.billedQty, 0);
  check("billed qty spread across rolls", near(silkBilled, 50, 0.0001), silkBilled);
  check("GRN partially billed", (await grn(g2.id)).billStatus === "partial");

  // Direct bill that receives stock, plus a service line to an expense account
  await expectError("stock line on a direct bill needs 'receive stock'", () =>
    saveSupplierBill(db, actor, { date, supplierId: sup.id, lines: [{ productId: lawn.id, description: "Lawn", qty: 1, price: 1, discountPct: 0, taxRate: 0 }] }), /stock item/);
  const transport = await accId("6400");
  const b3 = await saveSupplierBill(db, actor, {
    date,
    supplierId: sup.id,
    receivesStock: true,
    warehouseId: wh,
    lines: [
      { productId: lawn.id, description: "Lawn", qty: 10, price: 130, discountPct: 0, taxRate: 0 },
      { productId: null, description: "Transport", qty: 1, price: 500, discountPct: 0, taxRate: 0, expenseAccountId: transport },
      { productId: service.id, description: "Stitching", qty: 2, price: 100, discountPct: 0, taxRate: 0 },
    ],
  });
  const lawnBefore = (await getBalance(db, lawn.id, wh)).qty;
  const invBefore = await accountBalance(db, ACC.INVENTORY);
  await postSupplierBill(db, actor, { id: b3.id });
  check("direct bill receives stock", (await getBalance(db, lawn.id, wh)).qty === lawnBefore + 10);
  check("direct bill Dr Inventory", (await accountBalance(db, ACC.INVENTORY)) === invBefore + 1300);
  check("service line to chosen expense account", (await accountBalance(db, "6400")) === 500);
  check("service product defaults to general expense", (await accountBalance(db, ACC.GENERAL_EXPENSE)) === 200);
  const billMoves = await db.select().from(s.stockMovements).where(eq(s.stockMovements.sourceId, b3.id));
  check("bill stock movement sourceType supplier_bill", billMoves.length === 1 && billMoves[0].sourceType === "supplier_bill");

  console.log("Supplier payments");
  const bank = await accId(ACC.BANK);
  const open = await db.select().from(s.supplierBills).where(and(eq(s.supplierBills.supplierId, sup.id), eq(s.supplierBills.status, "posted")));
  const alloc = allocateOldestFirst(open.map((x) => ({ id: x.id, date: x.date, dueDate: x.dueDate, outstanding: x.total - x.amountPaid })), 10000);
  check("auto allocation fills bills in order", alloc.length === 2 && alloc[0].amount + alloc[1].amount === 10000, alloc);
  await expectError("allocation above payment rejected", () =>
    recordSupplierPayment(db, actor, { date, supplierId: sup.id, paidFromAccountId: bank, amount: 100, allocations: [{ billId: b1.id, amount: 200 }] }), /more than/);
  await expectError("allocation above bill outstanding rejected", () =>
    recordSupplierPayment(db, actor, { date, supplierId: sup.id, paidFromAccountId: bank, amount: 9000, allocations: [{ billId: b1.id, amount: 9000 }] }), /outstanding/);
  await expectError("pay-from must be cash or bank", async () =>
    recordSupplierPayment(db, actor, { date, supplierId: sup.id, paidFromAccountId: await accId("6400"), amount: 10 }), /cash or bank/);
  const balBefore = await partyBalance(db, "supplier", sup.id);
  const pay1 = await recordSupplierPayment(db, actor, {
    date,
    supplierId: sup.id,
    method: "bank",
    paidFromAccountId: bank,
    amount: 9000,
    reference: "CHQ-1",
    allocations: [
      { billId: b1.id, amount: 8450 },
      { billId: b2.id, amount: 550 },
    ],
  });
  check("payment reduces payable", (await partyBalance(db, "supplier", sup.id)) === balBefore - 9000);
  check("payment Cr bank", (await accountBalance(db, ACC.BANK)) === -9000);
  check("fully allocated bill is paid", (await bill(b1.id)).paymentStatus === "paid");
  b = await bill(b2.id);
  check("partly allocated bill is partial", b.paymentStatus === "partial" && b.amountPaid === 550, b);
  // Cash in hand can't be overdrawn, so put money in the till first
  await postJournal(db, actor, { date, memo: "Opening float", lines: [{ account: ACC.CASH, debit: 5000 }, { account: ACC.CAPITAL, credit: 5000 }] });
  await recordSupplierPayment(db, actor, { date, supplierId: sup.id, paidFromAccountId: await accId(ACC.CASH), method: "cash", amount: 1000 });
  check("unallocated payment stays as advance on the payable", (await partyBalance(db, "supplier", sup.id)) === balBefore - 10000);
  await expectError("bill with a payment can't be voided", () => voidSupplierBill(db, actor, { id: b1.id }), /Void the payment first/);

  console.log("Purchase returns");
  const b2Line = (await billLines(b2.id))[0];
  const ret1 = await savePurchaseReturn(db, actor, { date, billId: b2.id, reason: "Shade mismatch", lines: [{ billLineId: b2Line.id, qty: 10 }] });
  await expectError("roll required for batch products", () => postPurchaseReturn(db, actor, { id: ret1.id }), /roll/);
  const r101 = rolls.find((r) => r.batchNo === "R-101")!;
  await savePurchaseReturn(db, actor, { id: ret1.id, date, billId: b2.id, lines: [{ billLineId: b2Line.id, qty: 10, batchId: r101.id }] });
  const payBeforeRet = await partyBalance(db, "supplier", sup.id);
  await postPurchaseReturn(db, actor, { id: ret1.id });
  check("return takes stock out", near((await getBalance(db, silk.id, wh)).qty, 109.7, 0.0001));
  check("return reduces the roll", (await db.select().from(s.batches).where(eq(s.batches.id, r101.id)))[0].qty === 28.5);
  check("return Dr payable", (await partyBalance(db, "supplier", sup.id)) === payBeforeRet - 2000);
  b = await bill(b2.id);
  check("return counts toward bill settlement", b.amountPaid === 2550 && b.paymentStatus === "partial", b);
  await expectError("can't return more than billed", () =>
    savePurchaseReturn(db, actor, { date, billId: b2.id, lines: [{ billLineId: b2Line.id, qty: 45, batchId: r101.id }] }), /can still be returned/);

  // Return lawn from bill 1: bill cost 125 vs moving average -> difference to 5200
  const lawnAvg = (await getBalance(db, lawn.id, wh)).avgCost;
  const b1Line = (await billLines(b1.id))[0];
  const ret2 = await savePurchaseReturn(db, actor, { date, billId: b1.id, lines: [{ billLineId: b1Line.id, qty: 5 }] });
  const adjBefore = await accountBalance(db, ACC.INVENTORY_ADJUSTMENT);
  const invBeforeRet = await accountBalance(db, ACC.INVENTORY);
  await postPurchaseReturn(db, actor, { id: ret2.id });
  const r2 = (await db.select().from(s.purchaseReturns).where(eq(s.purchaseReturns.id, ret2.id)))[0];
  check("return value at bill cost incl. tax", r2.total === 625 + 62.5, r2.total);
  check("inventory credited at moving average", near(await accountBalance(db, ACC.INVENTORY), invBeforeRet - round(5 * lawnAvg)), [invBeforeRet, lawnAvg]);
  check("cost difference to 5200", near(await accountBalance(db, ACC.INVENTORY_ADJUSTMENT), adjBefore - (625 - round(5 * lawnAvg))));
  check("input tax reversed", (await accountBalance(db, ACC.INPUT_TAX)) === 750 - 62.5);

  console.log("Voids");
  await voidSupplierPayment(db, actor, { id: pay1.id });
  check("voided payment restores payable", (await partyBalance(db, "supplier", sup.id)) === payBeforeRet - 2000 - 687.5 + 9000);
  b = await bill(b1.id);
  check("bill back to partial (return only) after payment void", b.paymentStatus === "partial" && b.amountPaid === 687.5, b);
  await expectError("bill with a posted return can't be voided", () => voidSupplierBill(db, actor, { id: b1.id }), /return/);
  await voidPurchaseReturn(db, actor, { id: ret2.id });
  check("voided return restores stock", (await db.select().from(s.stockMovements).where(eq(s.stockMovements.sourceId, ret2.id))).length === 2);
  await voidSupplierBill(db, actor, { id: b1.id });
  check("voided bill: GRN unbilled again", (await grn(g1.id)).billStatus === "unbilled");
  check("voided bill: GRNI restored", (await accountBalance(db, ACC.GRNI)) === 7200 + (4800 + 23940 - 10000));
  check("voided bill: PO billed qty restored", (await poLines(order.id))[0].billedQty === 0);
  await voidGoodsReceipt(db, actor, { id: g1.id });
  check("voided GRN: PO back to partial", (await po(order.id)).status === "partial", (await po(order.id)).status);
  check("voided GRN: GRNI cleared", (await accountBalance(db, ACC.GRNI)) === 4800 + 23940 - 10000);
  const lawnAfter = (await getBalance(db, lawn.id, wh)).qty;
  await voidSupplierBill(db, actor, { id: b3.id });
  check("voided direct bill reverses stock", (await getBalance(db, lawn.id, wh)).qty === lawnAfter - 10);
  check("voided direct bill reverses expense", (await accountBalance(db, "6400")) === 0);
  await closePurchaseOrder(db, actor, { id: order.id });
  check("PO can be short-closed", (await po(order.id)).status === "closed");

  console.log("Books balance");
  await checkTrialBalance(db);

  await close();
  done();
}

const round = (n: number) => Math.round(n * 100) / 100;

async function checkTrialBalance(db: DB) {
  const rows = await db.execute<{ d: string; c: string }>(
    sql`select coalesce(sum(debit),0) d, coalesce(sum(credit),0) c from journal_lines where entry_id in (select id from journal_entries where status = 'posted')`
  );
  const r = rows.rows[0];
  check("trial balance debits = credits", Math.abs(Number(r.d) - Number(r.c)) < 0.001, r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
