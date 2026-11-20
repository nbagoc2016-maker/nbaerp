// Petty cash (imprest) funds and vouchers.
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { accounts, pettyCashFunds, pettyCashVouchers } from "@/db/schema";
import { formatMoney, round2 } from "@/lib/format";
import { AppError } from "../errors";
import { accountBalance, postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { assertCashAvailable, getAccountByCode, getPostableAccount, nextChildCode } from "./finance-accounts";
import type { FundInput, VoucherInput } from "./finance-shared";
import { nextNumber } from "./numbering";

export async function getFund(db: DbOrTx, id: string) {
  const [fund] = await db.select().from(pettyCashFunds).where(eq(pettyCashFunds.id, id));
  if (!fund) throw new AppError("Petty cash fund not found");
  return fund;
}

export async function fundBalance(db: DbOrTx, fundId: string, to?: string) {
  const fund = await getFund(db, fundId);
  return accountBalance(db, fund.accountId, { to });
}

/** How much to top up to bring the fund back to its float (never negative). */
export async function replenishAmount(db: DbOrTx, fundId: string) {
  const fund = await getFund(db, fundId);
  const balance = await accountBalance(db, fund.accountId);
  return Math.max(0, round2(fund.floatAmount - balance));
}

/** New fund: a petty_cash GL account under 1100 Cash plus the fund record. */
export async function createFund(db: DbOrTx, actor: Actor | null, input: FundInput) {
  const parent = await getAccountByCode(db, "1100");
  const code = await nextChildCode(db, parent);
  const [acc] = await db
    .insert(accounts)
    .values({ code, name: input.name, type: "asset", subtype: "petty_cash", parentId: parent.id })
    .returning();
  const [fund] = await db
    .insert(pettyCashFunds)
    .values({ name: input.name, accountId: acc.id, custodianName: input.custodianName ?? null, floatAmount: round2(input.floatAmount) })
    .returning();
  await logAudit(db, actor, { action: "create", entity: "petty_cash_fund", entityId: fund.id, summary: `Created petty cash fund ${input.name} (${code})` });
  return { id: fund.id, accountId: acc.id, code };
}

export async function updateFund(db: DbOrTx, actor: Actor | null, input: FundInput & { id: string }) {
  const fund = await getFund(db, input.id);
  await db
    .update(pettyCashFunds)
    .set({ name: input.name, custodianName: input.custodianName ?? null, floatAmount: round2(input.floatAmount) })
    .where(eq(pettyCashFunds.id, fund.id));
  await logAudit(db, actor, { action: "update", entity: "petty_cash_fund", entityId: fund.id, summary: `Updated petty cash fund ${input.name}` });
  return { id: fund.id };
}

export async function createVoucher(db: DbOrTx, actor: Actor | null, input: VoucherInput) {
  const fund = await getFund(db, input.fundId);
  if (!fund.isActive) throw new AppError("This petty cash fund is inactive");
  const fundAccount = await getPostableAccount(db, fund.accountId, { what: "petty cash account" });
  const amount = round2(input.amount);

  let other;
  if (input.type === "expense") {
    other = await getPostableAccount(db, input.accountId, { types: ["expense"], what: "expense account" });
    const balance = Math.min(await accountBalance(db, fund.accountId, { to: input.date }), await accountBalance(db, fund.accountId));
    if (amount > balance + 0.001) {
      throw new AppError(
        `This voucher is more than the money in ${fund.name}: balance ${formatMoney(balance, { fixed: true })}. Top up the fund first.`,
        { amount: "More than the fund balance" }
      );
    }
  } else {
    if (input.accountId === fund.accountId) throw new AppError("Choose the cash or bank account the money comes from");
    other = await getPostableAccount(db, input.accountId, { subtypes: ["cash", "bank"], what: "cash or bank account" });
    await assertCashAvailable(db, other, amount, input.date);
  }

  const number = await nextNumber(db, "PCV");
  const [row] = await db
    .insert(pettyCashVouchers)
    .values({
      number,
      date: input.date,
      fundId: fund.id,
      type: input.type,
      accountId: other.id,
      amount,
      payee: input.payee ?? null,
      description: input.description,
      receiptRef: input.receiptRef ?? null,
      createdBy: actor?.id ?? null,
    })
    .returning();

  const entry = await postJournal(db, actor, {
    date: input.date,
    memo: `${input.type === "expense" ? "Petty cash" : "Petty cash top-up"} — ${input.description}`,
    sourceType: "petty_cash",
    sourceId: row.id,
    sourceNumber: number,
    lines:
      input.type === "expense"
        ? [
            { account: other.id, debit: amount, memo: input.payee ?? null },
            { account: fundAccount.id, credit: amount },
          ]
        : [
            { account: fundAccount.id, debit: amount },
            { account: other.id, credit: amount },
          ],
  });
  await db.update(pettyCashVouchers).set({ journalEntryId: entry.id }).where(eq(pettyCashVouchers.id, row.id));
  await logAudit(db, actor, {
    action: "post",
    entity: "petty_cash_voucher",
    entityId: row.id,
    summary: `${input.type === "expense" ? "Petty cash expense" : "Petty cash top-up"} ${number}: ${amount} (${fund.name})`,
  });
  return { id: row.id, number };
}

export async function voidVoucher(db: DbOrTx, actor: Actor | null, input: { id: string; reason?: string | null }) {
  const [row] = await db.select().from(pettyCashVouchers).where(eq(pettyCashVouchers.id, input.id));
  if (!row) throw new AppError("Voucher not found");
  if (row.status === "void") throw new AppError("This voucher is already void");
  if (row.type === "topup") {
    // Removing a top-up must not leave the fund holding less than nothing
    const fund = await getFund(db, row.fundId);
    const balance = await accountBalance(db, fund.accountId);
    if (balance - row.amount < -0.001) {
      throw new AppError(`Voiding this top-up would leave ${fund.name} at ${formatMoney(balance - row.amount, { fixed: true })}. Void the expenses paid from it first.`);
    }
  }
  await voidJournal(db, actor, row.journalEntryId, input.reason ?? `Voucher ${row.number} voided`);
  await db.update(pettyCashVouchers).set({ status: "void" }).where(eq(pettyCashVouchers.id, row.id));
  await logAudit(db, actor, { action: "void", entity: "petty_cash_voucher", entityId: row.id, summary: `Voided voucher ${row.number}${input.reason ? `: ${input.reason}` : ""}` });
  return { id: row.id };
}
