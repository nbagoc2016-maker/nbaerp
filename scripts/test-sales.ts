// Sales module service tests (in-memory DB): invoices, receipts, returns, voids, POS, conversions.
import { and, eq } from "drizzle-orm";
import * as s from "../src/db/schema";
import type { DB } from "../src/db/client";
import { accountBalance, partyBalance } from "../src/server/services/accounting";
import { ACC } from "../src/server/services/chart-of-accounts";
import { createCustomer, updateCustomer } from "../src/server/services/customers";
import { postInvoice, saveInvoice, voidInvoice } from "../src/server/services/sales";
import { createInvoiceFromOrder, cancelOrder, confirmOrder } from "../src/server/services/sales-orders";
import { completePosSale, voidSale } from "../src/server/services/sales-pos";
import { convertQuotation, saveQuotation, setQuotationStatus } from "../src/server/services/sales-quotations";
import { createReceipt, openInvoicesFor, voidReceipt } from "../src/server/services/sales-receipts";
import { createReturn, voidReturn } from "../src/server/services/sales-returns";
import { fifoAllocate, type CustomerInput } from "../src/server/services/sales-schemas";
import { getBalance, moveStock } from "../src/server/services/stock";
import { check, createTestDb, done, expectError, makeProduct, warehouseId } from "./test-utils";

const date = "2026-11-05";

const customerInput = (over: Partial<CustomerInput> = {}): CustomerInput => ({
  name: "Ayesha Boutique",
  type: "wholesale",
  priceLevel: "wholesale",
  contactPerson: null,
  phone: "0300-1112233",
  altPhone: null,
  email: null,
  address: null,
  city: "Lahore",
  taxNumber: null,
  cnic: null,
  paymentTermsDays: 30,
  creditLimit: 0,
  openingBalance: 0,
  openingDate: null,
  notes: null,
  isActive: true,
  ...over,
});

async function accountId(db: DB, code: string) {
  return (await db.select().from(s.accounts).where(eq(s.accounts.code, code)))[0].id;
}

async function journalBalanced(db: DB, entryId: string | null) {
  if (!entryId) return false;
  const lines = await db.select().from(s.journalLines).where(eq(s.journalLines.entryId, entryId));
  const d = lines.reduce((x, l) => x + l.debit, 0);
  const c = lines.reduce((x, l) => x + l.credit, 0);
  return Math.abs(d - c) < 0.001 && lines.length >= 2;
}

async function invoice(db: DB, id: string) {
  return (await db.select().from(s.salesInvoices).where(eq(s.salesInvoices.id, id)))[0];
}

async function main() {
  const { db, close, actor } = await createTestDb();
  const wh = await warehouseId(db);
  const cashId = await accountId(db, ACC.CASH);
  const bankId = await accountId(db, ACC.BANK);

  const fabric = await makeProduct(db, { name: "Lawn Fabric", costPrice: 100, salePrice: 160, minSalePrice: 140 });
  const [pcs] = await db.select().from(s.units).where(eq(s.units.code, "pcs"));
  const shirt = await makeProduct(db, { name: "Kurta", unitId: pcs.id, costPrice: 500, salePrice: 1200 });
  await moveStock(db, actor, { date, productId: fabric.id, warehouseId: wh, qty: 100, unitCost: 100, sourceType: "opening" });
  await moveStock(db, actor, { date, productId: shirt.id, warehouseId: wh, qty: 20, unitCost: 500, sourceType: "opening" });

  console.log("Customers");
  const cust = await createCustomer(db, actor, customerInput({ openingBalance: 5000, creditLimit: 8000 }));
  check("customer code assigned", cust.code === "C-00001", cust.code);
  check("opening balance posted to receivable", (await partyBalance(db, "customer", cust.id)) === 5000);
  check("opening balance equity credited", (await accountBalance(db, ACC.OPENING_BALANCE)) === 5000);
  await expectError(
    "posted opening balance can't be changed",
    () => updateCustomer(db, actor, { ...customerInput({ openingBalance: 7000, creditLimit: 10000 }), id: cust.id }),
    /already posted/
  );

  console.log("Invoice post");
  const lines = [
    { productId: fabric.id, description: "Lawn Fabric", qty: 10.5, price: 160, discountPct: 0, taxRate: 0 },
    { productId: shirt.id, description: "Kurta", qty: 2, price: 1200, discountPct: 10, taxRate: 18 },
  ];
  const draft = await saveInvoice(db, actor, {
    date,
    dueDate: null,
    customerId: cust.id,
    customerName: null,
    customerPhone: null,
    warehouseId: wh,
    salesOrderId: null,
    salesperson: null,
    notes: null,
    lines,
    documentDiscount: 0,
    charges: 200,
    post: false,
  });
  let inv = await invoice(db, draft.id);
  check("draft has no stock effect", (await getBalance(db, fabric.id, wh)).qty === 100);
  check("due date from customer terms", inv.dueDate === "2026-12-05", inv.dueDate);
  // 10.5*160 = 1680; 2*1200 = 2400 - 10% = 2160 + 18% (388.8) = 2548.8; + 200 charges
  check("server total", inv.total === 4428.8, inv.total);

  const posted = await postInvoice(db, actor, draft.id);
  inv = await invoice(db, draft.id);
  check("invoice posted", inv.status === "posted" && inv.paymentStatus === "unpaid");
  check("credit limit warning returned", !!posted.warning && /credit limit/.test(posted.warning), posted.warning);
  check("fabric stock decreased", (await getBalance(db, fabric.id, wh)).qty === 89.5);
  check("kurta stock decreased", (await getBalance(db, shirt.id, wh)).qty === 18);
  check("cost total = moving average cost", inv.costTotal === 10.5 * 100 + 2 * 500, inv.costTotal);
  check("journal balanced", await journalBalanced(db, inv.journalEntryId));
  check("receivable = opening + total", (await partyBalance(db, "customer", cust.id)) === 5000 + 4428.8);
  check("COGS = cost", (await accountBalance(db, ACC.COGS)) === 2050);
  check("sales = net before tax", (await accountBalance(db, ACC.SALES)) === 1680 + 2160);
  check("output tax", (await accountBalance(db, ACC.OUTPUT_TAX)) === 388.8);
  check("charges to other income", (await accountBalance(db, ACC.OTHER_INCOME)) === 200);
  const [line1] = await db.select().from(s.salesInvoiceLines).where(and(eq(s.salesInvoiceLines.invoiceId, draft.id), eq(s.salesInvoiceLines.lineNo, 1)));
  check("line unit cost set", line1.unitCost === 100, line1.unitCost);

  await expectError(
    "below minimum price blocked",
    () =>
      saveInvoice(db, actor, {
        date, dueDate: null, customerId: null, customerName: null, customerPhone: null, warehouseId: wh, salesOrderId: null, salesperson: null, notes: null,
        lines: [{ productId: fabric.id, description: "Lawn", qty: 1, price: 120, discountPct: 0, taxRate: 0 }],
        documentDiscount: 0, charges: 0, post: false,
      }),
    /below/
  );
  await expectError(
    "fractional qty of a whole-unit product blocked",
    () =>
      saveInvoice(db, actor, {
        date, dueDate: null, customerId: null, customerName: null, customerPhone: null, warehouseId: wh, salesOrderId: null, salesperson: null, notes: null,
        lines: [{ productId: shirt.id, description: "Kurta", qty: 1.5, price: 1200, discountPct: 0, taxRate: 0 }],
        documentDiscount: 0, charges: 0, post: false,
      }),
    /whole/
  );
  const allowed = await saveInvoice(
    db,
    actor,
    {
      date, dueDate: null, customerId: null, customerName: "Counter", customerPhone: null, warehouseId: wh, salesOrderId: null, salesperson: null, notes: null,
      lines: [{ productId: fabric.id, description: "Lawn", qty: 1, price: 120, discountPct: 0, taxRate: 0 }],
      documentDiscount: 0, charges: 0, post: false,
    },
    { allowBelowMin: true }
  );
  check("below minimum allowed with sales.discount", !!allowed.id);
  await db.update(s.products).set({ wholesalePrice: 135 }).where(eq(s.products.id, fabric.id));
  const wholesaleDraft = await saveInvoice(db, actor, {
    date, dueDate: null, customerId: cust.id, customerName: null, customerPhone: null, warehouseId: wh, salesOrderId: null, salesperson: null, notes: null,
    lines: [{ productId: fabric.id, description: "Lawn", qty: 1, price: 135, discountPct: 0, taxRate: 0 }],
    documentDiscount: 0, charges: 0, post: false,
  });
  check("wholesale customer may buy at wholesale price under the minimum", !!wholesaleDraft.id);

  console.log("Receipts");
  const open = await openInvoicesFor(db, cust.id);
  check("open invoices listed", open.length === 1 && open[0].outstanding === 4428.8, open);
  const fifo = fifoAllocate(open, 3000);
  check("FIFO allocation", fifo[draft.id] === 3000, fifo);
  const r1 = await createReceipt(db, actor, {
    date, customerId: cust.id, method: "cash", depositAccountId: cashId, amount: 3000, reference: null, notes: null,
    allocations: Object.entries(fifo).map(([invoiceId, amount]) => ({ invoiceId, amount })),
  });
  inv = await invoice(db, draft.id);
  check("partial payment status", inv.paymentStatus === "partial" && inv.amountPaid === 3000, inv);
  check("cash debited", (await accountBalance(db, ACC.CASH)) === 3000);
  await expectError(
    "can't over-allocate an invoice",
    () => createReceipt(db, actor, { date, customerId: cust.id, method: "cash", depositAccountId: cashId, amount: 5000, reference: null, notes: null, allocations: [{ invoiceId: draft.id, amount: 5000 }] }),
    /outstanding/
  );
  const r2 = await createReceipt(db, actor, {
    date, customerId: cust.id, method: "bank", depositAccountId: bankId, amount: 2000, reference: "TT-1", notes: null,
    allocations: [{ invoiceId: draft.id, amount: 1428.8 }],
  });
  inv = await invoice(db, draft.id);
  check("fully paid", inv.paymentStatus === "paid" && inv.amountPaid === 4428.8, inv);
  check("unallocated stays on account", r2.unallocated === 571.2, r2);
  check("customer balance after receipts", (await partyBalance(db, "customer", cust.id)) === round(5000 + 4428.8 - 5000));

  await expectError("void blocked while receipts allocated", () => voidInvoice(db, actor, draft.id), /Void those receipts first/);
  await voidReceipt(db, actor, r2.id, "test");
  inv = await invoice(db, draft.id);
  check("receipt void reopens invoice", inv.paymentStatus === "partial" && inv.amountPaid === 3000, inv);

  console.log("Sales returns");
  const ilines = await db.select().from(s.salesInvoiceLines).where(eq(s.salesInvoiceLines.invoiceId, draft.id));
  const kurtaLine = ilines.find((l) => l.productId === shirt.id)!;
  const fabricLine = ilines.find((l) => l.productId === fabric.id)!;
  const balBeforeReturn = await partyBalance(db, "customer", cust.id);
  const ret1 = await createReturn(db, actor, {
    invoiceId: draft.id, date, settlement: "credit", refundAccountId: null, reason: "Size issue",
    lines: [{ invoiceLineId: kurtaLine.id, qty: 1 }], post: true,
  });
  // one kurta: 1200 - 10% = 1080 + 18% = 1274.4
  check("credit return total", ret1.total === 1274.4, ret1.total);
  check("stock back in", (await getBalance(db, shirt.id, wh)).qty === 19);
  check("receivable reduced", (await partyBalance(db, "customer", cust.id)) === round(balBeforeReturn - 1274.4));
  check("sales returns debited with net (income account shows negative)", (await accountBalance(db, ACC.SALES_RETURNS)) === -1080);
  check("COGS reversed at original cost", (await accountBalance(db, ACC.COGS)) === 2050 - 500);
  const [kl] = await db.select().from(s.salesInvoiceLines).where(eq(s.salesInvoiceLines.id, kurtaLine.id));
  check("returnedQty updated", kl.returnedQty === 1);
  inv = await invoice(db, draft.id);
  check("credit return settles invoice balance", inv.amountPaid === 4274.4 && inv.paymentStatus === "partial", inv);
  const [retRow] = await db.select().from(s.salesReturns).where(eq(s.salesReturns.id, ret1.id));
  check("return journal balanced", await journalBalanced(db, retRow.journalEntryId));
  await expectError(
    "can't return more than sold",
    () => createReturn(db, actor, { invoiceId: draft.id, date, settlement: "credit", refundAccountId: null, reason: null, lines: [{ invoiceLineId: kurtaLine.id, qty: 2 }], post: true }),
    /can still be returned/
  );

  const cashBefore = await accountBalance(db, ACC.CASH);
  const ret2 = await createReturn(db, actor, {
    invoiceId: draft.id, date, settlement: "refund", refundAccountId: cashId, reason: null,
    lines: [{ invoiceLineId: fabricLine.id, qty: 2.5 }], post: true,
  });
  check("refund return total", ret2.total === 400, ret2.total);
  check("refund paid from cash", (await accountBalance(db, ACC.CASH)) === cashBefore - 400);
  check("fabric back in", (await getBalance(db, fabric.id, wh)).qty === 92);
  await voidReturn(db, actor, ret2.id, "test");
  check("void refund return takes stock out again", (await getBalance(db, fabric.id, wh)).qty === 89.5);
  check("void refund return restores cash", (await accountBalance(db, ACC.CASH)) === cashBefore);
  const [fl] = await db.select().from(s.salesInvoiceLines).where(eq(s.salesInvoiceLines.id, fabricLine.id));
  check("void return resets returnedQty", fl.returnedQty === 0);

  console.log("Invoice void");
  await voidReceipt(db, actor, r1.id);
  await expectError("void blocked while returns exist", () => voidInvoice(db, actor, draft.id), /Returns exist/);
  await voidReturn(db, actor, ret1.id);
  await voidInvoice(db, actor, draft.id, "test");
  inv = await invoice(db, draft.id);
  check("invoice void", inv.status === "void");
  check("stock restored", (await getBalance(db, fabric.id, wh)).qty === 100 && (await getBalance(db, shirt.id, wh)).qty === 20);
  const [je] = await db.select().from(s.journalEntries).where(eq(s.journalEntries.id, inv.journalEntryId!));
  check("journal voided", je.status === "void");
  check("receivable back to opening", (await partyBalance(db, "customer", cust.id)) === 5000);
  check("COGS back to zero", (await accountBalance(db, ACC.COGS)) === 0);

  console.log("POS");
  const pos = await completePosSale(db, actor, {
    customerId: null, customerName: null, customerPhone: null, warehouseId: wh, documentDiscount: 100, notes: null,
    lines: [
      { productId: fabric.id, description: "Lawn Fabric", qty: 3.25, price: 160, discountPct: 0, taxRate: 0 },
      { productId: shirt.id, description: "Kurta", qty: 1, price: 1200, discountPct: 0, taxRate: 0 },
    ],
    payments: [
      { method: "card", accountId: bankId, amount: 500, reference: "1234" },
      { method: "cash", accountId: cashId, amount: 2000, reference: null },
    ],
  });
  // 520 + 1200 - 100 = 1620; card 500, cash due 1120 of 2000 -> change 880
  check("POS total", pos.total === 1620, pos.total);
  check("POS number series", pos.number.startsWith("POS-"), pos.number);
  check("change due", pos.change === 880, pos.change);
  check("two receipts", pos.receipts.length === 2 && pos.receipts.find((r) => r.method === "cash")?.amount === 1120, pos.receipts);
  const posInv = await invoice(db, pos.invoiceId);
  check("POS invoice posted & paid", posInv.status === "posted" && posInv.paymentStatus === "paid" && posInv.channel === "pos", posInv);
  check("walk-in receivable settled", (await accountBalance(db, ACC.RECEIVABLE)) === 5000);
  check("POS stock out", (await getBalance(db, fabric.id, wh)).qty === 96.75);
  await expectError(
    "walk-in must pay in full",
    () =>
      completePosSale(db, actor, {
        customerId: null, customerName: null, customerPhone: null, warehouseId: wh, documentDiscount: 0, notes: null,
        lines: [{ productId: shirt.id, description: "Kurta", qty: 1, price: 1200, discountPct: 0, taxRate: 0 }],
        payments: [{ method: "cash", accountId: cashId, amount: 500, reference: null }],
      }),
    /full/
  );
  const onAccount = await completePosSale(db, actor, {
    customerId: cust.id, customerName: null, customerPhone: null, warehouseId: wh, documentDiscount: 0, notes: null,
    lines: [{ productId: shirt.id, description: "Kurta", qty: 1, price: 1200, discountPct: 0, taxRate: 0 }],
    payments: [{ method: "cash", accountId: cashId, amount: 500, reference: null }],
  });
  check("registered customer balance on account", onAccount.balanceDue === 700 && (await invoice(db, onAccount.invoiceId)).paymentStatus === "partial");
  await voidSale(db, actor, pos.invoiceId, "test");
  check("POS void voids counter receipts", (await db.select().from(s.customerReceipts).where(eq(s.customerReceipts.status, "void"))).length >= 4);
  check("POS void restores stock", (await getBalance(db, fabric.id, wh)).qty === 100);

  console.log("Quotation → order → invoice");
  const qt = await saveQuotation(db, actor, {
    date, validUntil: "2026-11-30", customerId: cust.id, customerName: null, terms: "50% advance", notes: null,
    lines: [
      { productId: fabric.id, description: "Lawn Fabric", qty: 20, price: 150, discountPct: 0, taxRate: 0 },
      { productId: shirt.id, description: "Kurta", qty: 4, price: 1100, discountPct: 0, taxRate: 0 },
    ],
    documentDiscount: 400, charges: 300,
  });
  await setQuotationStatus(db, actor, qt.id, "sent");
  await setQuotationStatus(db, actor, qt.id, "accepted");
  const so = await convertQuotation(db, actor, qt.id, "order");
  const [qtRow] = await db.select().from(s.quotations).where(eq(s.quotations.id, qt.id));
  check("quotation converted", qtRow.status === "converted");
  const [soRow0] = await db.select().from(s.salesOrders).where(eq(s.salesOrders.id, so.id));
  check("order copies totals", soRow0.total === 3000 + 4400 - 400 + 300 && soRow0.quotationId === qt.id, soRow0.total);
  await confirmOrder(db, actor, so.id);
  const olines = await db.select().from(s.salesOrderLines).where(eq(s.salesOrderLines.orderId, so.id));
  const fabOL = olines.find((l) => l.productId === fabric.id)!;
  const kurOL = olines.find((l) => l.productId === shirt.id)!;
  const part = await createInvoiceFromOrder(db, actor, { orderId: so.id, date, warehouseId: wh, lines: [{ orderLineId: fabOL.id, qty: 10 }, { orderLineId: kurOL.id, qty: 0 }] });
  await postInvoice(db, actor, part.id);
  let [soRow] = await db.select().from(s.salesOrders).where(eq(s.salesOrders.id, so.id));
  check("order partially invoiced", soRow.status === "partial", soRow.status);
  const partInv = await invoice(db, part.id);
  // 10 x 150 = 1500; bill discount share 400 * 1500/7400 = 81.08; first invoice carries 300 charges
  check("partial invoice prorates discount and carries charges", partInv.documentDiscount === 81.08 && partInv.shippingCharges === 300, partInv);
  await expectError(
    "can't invoice more than ordered",
    () => createInvoiceFromOrder(db, actor, { orderId: so.id, date, warehouseId: wh, lines: [{ orderLineId: fabOL.id, qty: 11 }] }),
    /left to invoice/
  );
  const rest = await createInvoiceFromOrder(db, actor, { orderId: so.id, date, warehouseId: wh, lines: [{ orderLineId: fabOL.id, qty: 10 }, { orderLineId: kurOL.id, qty: 4 }] });
  await postInvoice(db, actor, rest.id);
  [soRow] = await db.select().from(s.salesOrders).where(eq(s.salesOrders.id, so.id));
  check("order fulfilled", soRow.status === "fulfilled", soRow.status);
  const restInv = await invoice(db, rest.id);
  check("invoices add up to the order", round(partInv.total + restInv.total) === soRow.total, [partInv.total, restInv.total, soRow.total]);
  await voidInvoice(db, actor, rest.id);
  [soRow] = await db.select().from(s.salesOrders).where(eq(s.salesOrders.id, so.id));
  check("voiding an order invoice reopens the order", soRow.status === "partial", soRow.status);
  await cancelOrder(db, actor, so.id, "test");

  const qt2 = await saveQuotation(db, actor, {
    date, validUntil: null, customerId: null, customerName: "Mrs. Rehman", terms: null, notes: null,
    lines: [{ productId: shirt.id, description: "Kurta", qty: 1, price: 1200, discountPct: 0, taxRate: 0 }],
    documentDiscount: 0, charges: 0,
  });
  await expectError("walk-in quotation can't become an order", () => convertQuotation(db, actor, qt2.id, "order"), /registered customer/);
  const fromQt = await convertQuotation(db, actor, qt2.id, "invoice");
  const qInv = await invoice(db, fromQt.id);
  check("quotation → invoice draft", qInv.status === "draft" && qInv.customerName === "Mrs. Rehman" && qInv.total === 1200, qInv);

  await close();
  done();
}

const round = (n: number) => Math.round(n * 100) / 100;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
