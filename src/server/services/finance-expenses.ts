// Direct expenses paid from cash, bank or petty cash.
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { expenses } from "@/db/schema";
import { round2 } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { assertCashAvailable, getPostableAccount } from "./finance-accounts";
import { CASH_SUBTYPES, type ExpenseInput } from "./finance-shared";
import { nextNumber } from "./numbering";

/** Amount is before tax; input tax is reclaimable (Dr 1600). The paying account is credited with both. */
export async function createExpense(db: DbOrTx, actor: Actor | null, input: ExpenseInput) {
  const amount = round2(input.amount);
  const tax = round2(input.taxAmount ?? 0);
  const total = round2(amount + tax);
  const expenseAcc = await getPostableAccount(db, input.expenseAccountId, { types: ["expense"], what: "expense account" });
  const paidFrom = await getPostableAccount(db, input.paidFromAccountId, { subtypes: CASH_SUBTYPES, what: "cash, bank or petty cash account" });
  await assertCashAvailable(db, paidFrom, total, input.date);

  const number = await nextNumber(db, "EXP");
  const [row] = await db
    .insert(expenses)
    .values({
      number,
      date: input.date,
      expenseAccountId: expenseAcc.id,
      paidFromAccountId: paidFrom.id,
      amount,
      taxAmount: tax,
      payee: input.payee ?? null,
      supplierId: input.supplierId ?? null,
      description: input.description,
      reference: input.reference ?? null,
      createdBy: actor?.id ?? null,
    })
    .returning();

  const entry = await postJournal(db, actor, {
    date: input.date,
    memo: `${expenseAcc.name} — ${input.description}${input.payee ? ` (${input.payee})` : ""}`,
    sourceType: "expense",
    sourceId: row.id,
    sourceNumber: number,
    lines: [
      { account: expenseAcc.id, debit: amount, memo: input.description },
      ...(tax > 0 ? [{ account: ACC.INPUT_TAX, debit: tax, memo: "Input tax" }] : []),
      { account: paidFrom.id, credit: total },
    ],
  });
  await db.update(expenses).set({ journalEntryId: entry.id }).where(eq(expenses.id, row.id));
  await logAudit(db, actor, { action: "post", entity: "expense", entityId: row.id, summary: `Expense ${number}: ${total} to ${expenseAcc.name} from ${paidFrom.name}` });
  return { id: row.id, number };
}

export async function voidExpense(db: DbOrTx, actor: Actor | null, input: { id: string; reason?: string | null }) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, input.id));
  if (!row) throw new AppError("Expense not found");
  if (row.status === "void") throw new AppError("This expense is already void");
  await voidJournal(db, actor, row.journalEntryId, input.reason ?? `Expense ${row.number} voided`);
  await db.update(expenses).set({ status: "void" }).where(eq(expenses.id, row.id));
  await logAudit(db, actor, { action: "void", entity: "expense", entityId: row.id, summary: `Voided expense ${row.number}${input.reason ? `: ${input.reason}` : ""}` });
  return { id: row.id };
}
