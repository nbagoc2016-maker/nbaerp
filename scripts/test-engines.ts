// Tests for the core engines: numbering, journal posting, balances, stock costing.
import { calcDocument } from "../src/lib/doc-calc";
import { accountBalance, partyBalance, postJournal, voidJournal } from "../src/server/services/accounting";
import { ACC } from "../src/server/services/chart-of-accounts";
import { nextNumber } from "../src/server/services/numbering";
import { getBalance, moveStock } from "../src/server/services/stock";
import { check, createTestDb, done, expectError, makeProduct, warehouseId } from "./test-utils";

async function main() {
  const { db, close, actor } = await createTestDb();
  const date = "2026-11-05";

  console.log("Numbering");
  check("first invoice number", (await nextNumber(db, "SI")) === "INV-00001");
  check("second invoice number", (await nextNumber(db, "SI")) === "INV-00002");

  console.log("Journals");
  await postJournal(db, actor, { date, memo: "capital", lines: [{ account: ACC.CASH, debit: 1000 }, { account: ACC.CAPITAL, credit: 1000 }] });
  check("cash balance after capital", (await accountBalance(db, ACC.CASH)) === 1000);
  check("capital is a credit-normal balance", (await accountBalance(db, ACC.CAPITAL)) === 1000);
  await expectError("unbalanced journal rejected", () =>
    postJournal(db, actor, { date, lines: [{ account: ACC.CASH, debit: 10 }, { account: ACC.CAPITAL, credit: 9 }] }), /out of balance/);
  await expectError("posting to a header account rejected", () =>
    postJournal(db, actor, { date, lines: [{ account: "1000", debit: 10 }, { account: ACC.CAPITAL, credit: 10 }] }), /header account/);

  const sale = await postJournal(db, actor, {
    date,
    lines: [
      { account: ACC.RECEIVABLE, debit: 500, partyType: "customer", partyId: "cust-1" },
      { account: ACC.SALES, credit: 500 },
    ],
  });
  check("customer balance from GL", (await partyBalance(db, "customer", "cust-1")) === 500);
  await voidJournal(db, actor, sale.id);
  check("voided journal leaves balances", (await partyBalance(db, "customer", "cust-1")) === 0);

  console.log("Stock");
  const p = await makeProduct(db);
  const wh = await warehouseId(db);
  await moveStock(db, actor, { date, productId: p.id, warehouseId: wh, qty: 10, unitCost: 100, sourceType: "opening" });
  await moveStock(db, actor, { date, productId: p.id, warehouseId: wh, qty: 10, unitCost: 130, sourceType: "goods_receipt" });
  let bal = await getBalance(db, p.id, wh);
  check("qty after two receipts", bal.qty === 20, bal.qty);
  check("moving average cost", bal.avgCost === 115, bal.avgCost);
  const issue = await moveStock(db, actor, { date, productId: p.id, warehouseId: wh, qty: -4.5, sourceType: "sales_invoice" });
  check("issue leaves at average cost", issue.unitCost === 115 && issue.value === -517.5, issue);
  bal = await getBalance(db, p.id, wh);
  check("fractional qty kept", bal.qty === 15.5, bal.qty);
  await expectError("can't oversell", () => moveStock(db, actor, { date, productId: p.id, warehouseId: wh, qty: -100, sourceType: "sales_invoice" }), /Not enough stock/);

  console.log("Document maths");
  const t = calcDocument(
    [
      { qty: 2, price: 1000, discountPct: 10, taxRate: 0 },
      { qty: 1.5, price: 400, taxRate: 18 },
    ],
    { documentDiscount: 200, charges: 150 }
  );
  check("subtotal", t.subtotal === 2600, t.subtotal);
  check("discount total (line + bill)", t.discountTotal === 400, t.discountTotal);
  check("net before tax", t.netBeforeTax === 2200, t.netBeforeTax);
  // Bill discount 200 split 150/50 by line net (1800/600), so taxable line 2 = 550 -> 18% = 99
  check("tax on discounted amount", t.taxTotal === 99, t.taxTotal);
  check("total", t.total === 2449, t.total);

  await close();
  done();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
