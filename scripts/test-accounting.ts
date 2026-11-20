// Accounting & Finance service tests: npx tsx scripts/test-accounting.ts
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { accountBalance, postJournal } from "../src/server/services/accounting";
import { ACC } from "../src/server/services/chart-of-accounts";
import { createAccount, deleteAccount, setAccountActive, updateAccount } from "../src/server/services/finance-accounts";
import { createBankAccount, createTransfer, voidTransfer } from "../src/server/services/finance-banking";
import { setLockDate } from "../src/server/services/finance-close";
import { createExpense, voidExpense } from "../src/server/services/finance-expenses";
import { createManualJournal, voidManualJournal } from "../src/server/services/finance-journals";
import { createFund, createVoucher, fundBalance, replenishAmount, voidVoucher } from "../src/server/services/finance-petty-cash";
import { balanceSheet, cashFlow, chartOfAccounts, generalLedger, profitAndLoss, trialBalance } from "../src/server/services/finance-reports";
import { previousPeriod } from "../src/server/services/finance-shared";
import { check, createTestDb, done, expectError } from "./test-utils";

async function main() {
  const { db, close, actor } = await createTestDb();
  const id = async (code: string) => (await db.select().from(schema.accounts).where(eq(schema.accounts.code, code)))[0].id;
  const bal = (code: string, to?: string) => accountBalance(db, code, { to });

  // Owner puts in capital before the test period
  await postJournal(db, actor, {
    date: "2026-09-01",
    memo: "Capital",
    sourceType: "opening",
    lines: [
      { account: ACC.BANK, debit: 500000 },
      { account: ACC.CASH, debit: 50000 },
      { account: ACC.CAPITAL, credit: 550000 },
    ],
  });

  console.log("Manual journals");
  const jv = await createManualJournal(db, actor, {
    date: "2026-10-02",
    memo: "Prepaid rent deposit",
    isOpening: false,
    lines: [
      { accountId: await id("1800"), debit: 30000, credit: 0 },
      { accountId: await id(ACC.BANK), debit: 0, credit: 30000 },
    ],
  });
  check("manual journal posts", (await bal("1800")) === 30000 && (await bal(ACC.BANK)) === 470000);
  await expectError(
    "unbalanced manual journal rejected",
    () =>
      createManualJournal(db, actor, {
        date: "2026-10-02",
        memo: "x",
        isOpening: false,
        lines: [
          { accountId: ACC.CASH, debit: 100, credit: 0 },
          { accountId: ACC.CAPITAL, debit: 0, credit: 90 },
        ],
      }),
    /must be equal/
  );
  await expectError(
    "party type without party rejected",
    () =>
      createManualJournal(db, actor, {
        date: "2026-10-02",
        memo: "x",
        isOpening: false,
        lines: [
          { accountId: ACC.RECEIVABLE, debit: 100, credit: 0, partyType: "customer", partyId: null },
          { accountId: ACC.SALES, debit: 0, credit: 100 },
        ],
      }),
    /party/
  );
  await voidManualJournal(db, actor, { id: jv.id, reason: "test" });
  check("void manual journal reverses balances", (await bal("1800")) === 0 && (await bal(ACC.BANK)) === 500000);
  await expectError("voiding twice rejected", () => voidManualJournal(db, actor, { id: jv.id }), /already void/);

  console.log("Chart of accounts rules");
  const opexGroup = await id("6000");
  await expectError(
    "can't create under a postable account",
    async () => createAccount(db, actor, { parentId: await id("6200"), code: "6210", name: "Shop rent", isGroup: false, subtype: "expense", description: null }),
    /header/
  );
  await expectError(
    "duplicate code rejected",
    () => createAccount(db, actor, { parentId: opexGroup, code: "6200", name: "Dup", isGroup: false, subtype: "expense", description: null }),
    /already used/
  );
  await expectError(
    "subtype must fit the inherited type",
    () => createAccount(db, actor, { parentId: opexGroup, code: "6960", name: "Bad", isGroup: false, subtype: "sales", description: null }),
    /doesn't fit/
  );
  const software = await createAccount(db, actor, { parentId: opexGroup, code: "6950", name: "Software Subscriptions", isGroup: false, subtype: "expense", description: null });
  check("new account inherits type from parent", software.type === "expense");
  const travelGroup = await createAccount(db, actor, { parentId: opexGroup, code: "6970", name: "Travel", isGroup: true, subtype: null, description: null });
  await expectError(
    "no postings to group accounts",
    () =>
      createManualJournal(db, actor, {
        date: "2026-10-03",
        memo: "x",
        isOpening: false,
        lines: [
          { accountId: travelGroup.id, debit: 100, credit: 0 },
          { accountId: ACC.CASH, debit: 0, credit: 100 },
        ],
      }),
    /header account/
  );
  const wallet = await createAccount(db, actor, { parentId: await id("1200"), code: "1290", name: "JazzCash Wallet", isGroup: false, subtype: "bank", description: null });
  const [walletReg] = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.accountId, wallet.id));
  check("bank subtype account gets a register", !!walletReg);
  await expectError("system account delete blocked", async () => deleteAccount(db, actor, await id(ACC.CASH)), /System accounts/);
  await expectError("system account code can't change", async () =>
    updateAccount(db, actor, { id: await id(ACC.CASH), parentId: await id("1100"), code: "1199", name: "Cash", isGroup: false, subtype: "cash", description: null }), /code of a system account/);
  await expectError("system account can't be retyped", async () =>
    updateAccount(db, actor, { id: await id(ACC.CASH), parentId: await id("1100"), code: ACC.CASH, name: "Cash", isGroup: false, subtype: "bank", description: null }), /subtype of a system account/);

  console.log("Expenses");
  const exp = await createExpense(db, actor, {
    date: "2026-10-05",
    expenseAccountId: software.id,
    paidFromAccountId: await id(ACC.BANK),
    amount: 1000,
    taxAmount: 180,
    payee: "SaaS Inc",
    supplierId: null,
    description: "Monthly plan",
    reference: null,
  });
  check("expense debits expense account net of tax", (await accountBalance(db, software.id)) === 1000);
  check("expense debits input tax", (await bal(ACC.INPUT_TAX)) === 180);
  check("expense credits paying account with total", (await bal(ACC.BANK)) === 500000 - 1180);
  await expectError("used account can't be deleted", () => deleteAccount(db, actor, software.id), /has postings/);
  await expectError("account with balance can't be deactivated", () => setAccountActive(db, actor, { id: software.id, active: false }), /balance/);
  await expectError("expense from a non-cash account rejected", async () =>
    createExpense(db, actor, { date: "2026-10-05", expenseAccountId: software.id, paidFromAccountId: await id(ACC.RECEIVABLE), amount: 10, taxAmount: 0, payee: null, supplierId: null, description: "x", reference: null }), /not a valid/);
  await expectError("cash can't go negative on an expense", async () =>
    createExpense(db, actor, { date: "2026-10-05", expenseAccountId: software.id, paidFromAccountId: await id(ACC.CASH), amount: 60000, taxAmount: 0, payee: null, supplierId: null, description: "x", reference: null }), /Not enough money/);
  const [expJe] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, exp.id));
  await expectError("system journals can't be voided from the journal screen", () => voidManualJournal(db, actor, { id: expJe.journalEntryId! }), /Void that document/);
  const exp2 = await createExpense(db, actor, {
    date: "2026-10-06",
    expenseAccountId: await id("6200"),
    paidFromAccountId: await id(ACC.CASH),
    amount: 25000,
    taxAmount: 0,
    payee: "Landlord",
    supplierId: null,
    description: "October rent",
    reference: null,
  });
  await voidExpense(db, actor, { id: exp2.id, reason: "duplicate" });
  check("voided expense leaves no trace in balances", (await bal(ACC.CASH)) === 50000 && (await bal("6200")) === 0);
  await deleteAccount(db, actor, travelGroup.id);
  check("unused account can be deleted", (await db.select().from(schema.accounts).where(eq(schema.accounts.id, travelGroup.id))).length === 0);

  console.log("Bank transfers");
  const reg = await createBankAccount(db, actor, { name: "HBL Savings", kind: "bank", bankName: "HBL", accountTitle: null, accountNumber: "123", iban: null, branch: null, openingBalance: 0 });
  check("new bank account under 1200", reg.code.startsWith("12"), reg.code);
  const cashBox = await createBankAccount(db, actor, { name: "Shop Till", kind: "cash", bankName: null, accountTitle: null, accountNumber: null, iban: null, branch: null, openingBalance: 0 });
  check("new cash account under 1100", cashBox.code.startsWith("11"), cashBox.code);
  const bt = await createTransfer(db, actor, { date: "2026-10-07", fromAccountId: await id(ACC.BANK), toAccountId: reg.accountId, amount: 100000, reference: "CHQ-1", notes: null });
  check("transfer moves money", (await accountBalance(db, reg.accountId)) === 100000 && (await bal(ACC.BANK)) === 500000 - 1180 - 100000);
  const [btJe] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.sourceId, bt.id));
  check("transfer journal tagged bank_transfer", btJe?.sourceType === "bank_transfer" && btJe.total === 100000);
  await expectError("can't transfer to the same account", async () =>
    createTransfer(db, actor, { date: "2026-10-07", fromAccountId: reg.accountId, toAccountId: reg.accountId, amount: 1, reference: null, notes: null }), /different/);
  await expectError("can't take more cash than the till holds", async () =>
    createTransfer(db, actor, { date: "2026-10-07", fromAccountId: cashBox.accountId, toAccountId: reg.accountId, amount: 1, reference: null, notes: null }), /Not enough money/);
  const bt2 = await createTransfer(db, actor, { date: "2026-10-08", fromAccountId: reg.accountId, toAccountId: await id(ACC.BANK), amount: 20000, reference: null, notes: null });
  await voidTransfer(db, actor, { id: bt2.id });
  check("voided transfer reverses", (await accountBalance(db, reg.accountId)) === 100000);

  console.log("Petty cash");
  const [fund] = await db.select().from(schema.pettyCashFunds);
  check("fund starts empty", (await fundBalance(db, fund.id)) === 0);
  check("replenish amount = float when empty", (await replenishAmount(db, fund.id)) === 10000);
  const top = await createVoucher(db, actor, { fundId: fund.id, date: "2026-10-09", type: "topup", accountId: await id(ACC.CASH), amount: 8000, payee: null, description: "Top-up", receiptRef: null });
  check("top-up: Dr fund, Cr cash", (await fundBalance(db, fund.id)) === 8000 && (await bal(ACC.CASH)) === 42000);
  await createVoucher(db, actor, { fundId: fund.id, date: "2026-10-10", type: "expense", accountId: await id("6550"), amount: 3000, payee: "Tea stall", description: "Tea for staff", receiptRef: "R-1" });
  check("expense voucher: Dr expense, Cr fund", (await fundBalance(db, fund.id)) === 5000 && (await bal("6550")) === 3000);
  await expectError("over-spend blocked against fund balance", async () =>
    createVoucher(db, actor, { fundId: fund.id, date: "2026-10-10", type: "expense", accountId: await id("6500"), amount: 5000.01, payee: null, description: "Too much", receiptRef: null }), /more than the money/);
  check("replenish amount = float - balance", (await replenishAmount(db, fund.id)) === 5000);
  await expectError("top-up void blocked once spent", () => voidVoucher(db, actor, { id: top.id }), /Void the expenses/);
  const fund2 = await createFund(db, actor, { name: "Warehouse Petty", custodianName: "Ali", floatAmount: 5000 });
  const [f2acc] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, fund2.accountId));
  check("new fund gets a petty_cash account under 1100", f2acc.subtype === "petty_cash" && fund2.code.startsWith("11"), fund2.code);

  console.log("Sales activity for statements");
  await postJournal(db, actor, {
    date: "2026-10-15",
    sourceType: "sales_invoice",
    lines: [
      { account: ACC.RECEIVABLE, debit: 118000, partyType: "customer", partyId: "c1" },
      { account: ACC.SALES, credit: 100000 },
      { account: ACC.OUTPUT_TAX, credit: 18000 },
      { account: ACC.COGS, debit: 60000 },
      { account: ACC.INVENTORY, credit: 60000 },
    ],
  });
  await postJournal(db, actor, {
    date: "2026-09-10",
    memo: "Opening stock",
    sourceType: "opening",
    lines: [
      { account: ACC.INVENTORY, debit: 200000 },
      { account: ACC.OPENING_BALANCE, credit: 200000 },
    ],
  });
  await postJournal(db, actor, {
    date: "2026-10-20",
    sourceType: "sales_return",
    lines: [
      { account: ACC.SALES_RETURNS, debit: 10000 },
      { account: ACC.OUTPUT_TAX, debit: 1800 },
      { account: ACC.RECEIVABLE, credit: 11800, partyType: "customer", partyId: "c1" },
      { account: ACC.INVENTORY, debit: 6000 },
      { account: ACC.COGS, credit: 6000 },
    ],
  });
  await postJournal(db, actor, {
    date: "2026-10-22",
    sourceType: "customer_receipt",
    lines: [
      { account: ACC.BANK, debit: 50000 },
      { account: ACC.RECEIVABLE, credit: 50000, partyType: "customer", partyId: "c1" },
    ],
  });
  await postJournal(db, actor, {
    date: "2026-10-25",
    memo: "Bank interest",
    lines: [
      { account: ACC.BANK, debit: 500 },
      { account: ACC.OTHER_INCOME, credit: 500 },
    ],
  });

  console.log("Statements");
  const period = { from: "2026-10-01", to: "2026-10-31" };
  const tb = await trialBalance(db, period.to);
  check("trial balance totals equal", tb.balanced && tb.totalDebit === tb.totalCredit, { d: tb.totalDebit, c: tb.totalCredit });
  check("trial balance skips zero accounts", tb.rows.every((r) => r.debit !== 0 || r.credit !== 0) && !tb.rows.some((r) => r.code === "6200"));

  const pnl = await profitAndLoss(db, period);
  check("revenue = sales - returns", pnl.netRevenue === 90000, pnl.netRevenue);
  check("cost of sales net of returns", pnl.costOfSales.total === 54000, pnl.costOfSales.total);
  check("gross profit", pnl.grossProfit === 36000, pnl.grossProfit);
  // opex: software 1000 + tea 3000
  check("operating expenses", pnl.operatingExpenses.total === 4000, pnl.operatingExpenses.total);
  check("other income", pnl.otherIncome.total === 500, pnl.otherIncome.total);
  check("net profit", pnl.netProfit === 32500, pnl.netProfit);

  const bsBefore = await balanceSheet(db, "2026-09-30");
  const bsAfter = await balanceSheet(db, period.to);
  check("balance sheet balances (start)", bsBefore.balanced, bsBefore.difference);
  check("balance sheet balances (end)", bsAfter.balanced, bsAfter.difference);
  check("P&L net profit equals change in equity", Math.abs(bsAfter.totalEquity - bsBefore.totalEquity - pnl.netProfit) < 0.005, {
    change: bsAfter.totalEquity - bsBefore.totalEquity,
    np: pnl.netProfit,
  });
  check("current period earnings shown in equity", bsAfter.currentEarnings === 32500, bsAfter.currentEarnings);

  const prev = await profitAndLoss(db, previousPeriod(period.from, period.to));
  check("comparison period is September", prev.from === "2026-09-01" && prev.to === "2026-09-30", prev);
  check("previousPeriod for odd ranges keeps length", JSON.stringify(previousPeriod("2026-10-11", "2026-10-20")) === JSON.stringify({ from: "2026-10-01", to: "2026-10-10" }));

  const cf = await cashFlow(db, period);
  const cashNow = (await bal(ACC.CASH, period.to)) + (await bal(ACC.BANK, period.to)) + (await bal(ACC.PETTY_CASH, period.to)) + (await accountBalance(db, reg.accountId, { to: period.to }));
  check("cash flow closing = cash + bank balances", Math.abs(cf.closing - cashNow) < 0.005, { closing: cf.closing, cashNow });
  check("cash flow opening = balances before period", cf.opening === 550000, cf.opening);
  check("internal transfers don't count as flows", !cf.rows.some((r) => r.sourceType === "bank_transfer"), cf.rows);

  const gl = await generalLedger(db, { accountId: await id(ACC.BANK), ...period });
  check("ledger opening", gl.opening === 500000, gl.opening);
  check("ledger closing = account balance", gl.closing === (await bal(ACC.BANK, period.to)), gl.closing);
  check("ledger excludes void lines", gl.lines.length === 4, gl.lines.length);
  const glParty = await generalLedger(db, { accountId: await id(ACC.RECEIVABLE), ...period, partyType: "customer", partyId: "c1" });
  check("party-filtered ledger", glParty.closing === 118000 - 11800 - 50000, glParty.closing);

  const chart = await chartOfAccounts(db, period.to);
  const assetsRoot = chart.find((a) => a.code === "1000")!;
  check("group balances roll up", Math.abs(assetsRoot.balance - bsAfter.totalAssets) < 0.005, { root: assetsRoot.balance, bs: bsAfter.totalAssets });

  console.log("Lock date");
  await expectError("can't lock today or later", () => setLockDate(db, actor, { lockDate: "2999-01-01" }), /ended/);
  await setLockDate(db, actor, { lockDate: "2026-10-31" });
  await expectError("posting on/before the lock date blocked", async () =>
    createExpense(db, actor, { date: "2026-10-31", expenseAccountId: software.id, paidFromAccountId: await id(ACC.BANK), amount: 10, taxAmount: 0, payee: null, supplierId: null, description: "late", reference: null }), /books are closed/);
  await expectError("voiding in a closed period blocked", () => voidExpense(db, actor, { id: exp.id }), /books are closed/);
  await setLockDate(db, actor, { lockDate: null });
  const late = await createExpense(db, actor, { date: "2026-10-31", expenseAccountId: software.id, paidFromAccountId: await id(ACC.BANK), amount: 10, taxAmount: 0, payee: null, supplierId: null, description: "late", reference: null });
  check("reopened books accept postings", !!late.id);

  await close();
  done();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
