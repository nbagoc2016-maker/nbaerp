// Cash & bank registers and transfers between them.
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { accounts, bankAccounts, bankTransfers } from "@/db/schema";
import { round2, today } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { assertCashAvailable, getAccountByCode, getPostableAccount, nextChildCode } from "./finance-accounts";
import { nextNumber } from "./numbering";
import { CASH_SUBTYPES, type BankAccountInput, type TransferInput } from "./finance-shared";

/** New cash / bank / wallet register: a GL account under 1100 (cash) or 1200 (bank) plus its register row. */
export async function createBankAccount(db: DbOrTx, actor: Actor | null, input: BankAccountInput) {
  const parent = await getAccountByCode(db, input.kind === "cash" ? "1100" : "1200");
  const code = await nextChildCode(db, parent);
  const [acc] = await db
    .insert(accounts)
    .values({
      code,
      name: input.name,
      type: "asset",
      subtype: input.kind === "cash" ? "cash" : "bank", // wallets behave like bank accounts in the GL
      parentId: parent.id,
      description: [input.bankName, input.accountNumber].filter(Boolean).join(" · ") || null,
    })
    .returning();
  const [register] = await db
    .insert(bankAccounts)
    .values({
      accountId: acc.id,
      name: input.name,
      kind: input.kind,
      bankName: input.bankName ?? null,
      accountTitle: input.accountTitle ?? null,
      accountNumber: input.accountNumber ?? null,
      iban: input.iban ?? null,
      branch: input.branch ?? null,
    })
    .returning();

  if (input.openingBalance > 0) {
    await postJournal(db, actor, {
      date: input.openingDate ?? today(),
      memo: `Opening balance — ${input.name}`,
      sourceType: "opening",
      lines: [
        { account: acc.id, debit: input.openingBalance },
        { account: ACC.OPENING_BALANCE, credit: input.openingBalance },
      ],
    });
  }
  await logAudit(db, actor, { action: "create", entity: "bank_account", entityId: register.id, summary: `Added ${input.kind} account ${input.name} (${code})` });
  return { id: register.id, accountId: acc.id, code };
}

export async function updateBankAccount(
  db: DbOrTx,
  actor: Actor | null,
  input: { id: string } & Pick<BankAccountInput, "name" | "bankName" | "accountTitle" | "accountNumber" | "iban" | "branch">
) {
  const [reg] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, input.id));
  if (!reg) throw new AppError("Register not found");
  await db
    .update(bankAccounts)
    .set({
      name: input.name,
      bankName: input.bankName ?? null,
      accountTitle: input.accountTitle ?? null,
      accountNumber: input.accountNumber ?? null,
      iban: input.iban ?? null,
      branch: input.branch ?? null,
    })
    .where(eq(bankAccounts.id, reg.id));
  await logAudit(db, actor, { action: "update", entity: "bank_account", entityId: reg.id, summary: `Updated register ${input.name}` });
  return { id: reg.id };
}

export async function createTransfer(db: DbOrTx, actor: Actor | null, input: TransferInput) {
  if (input.fromAccountId === input.toAccountId) throw new AppError("Choose two different accounts", { toAccountId: "Same as the source" });
  const amount = round2(input.amount);
  const from = await getPostableAccount(db, input.fromAccountId, { subtypes: CASH_SUBTYPES, what: "cash or bank account" });
  const to = await getPostableAccount(db, input.toAccountId, { subtypes: CASH_SUBTYPES, what: "cash or bank account" });
  await assertCashAvailable(db, from, amount, input.date);

  const number = await nextNumber(db, "BT");
  const [row] = await db
    .insert(bankTransfers)
    .values({
      number,
      date: input.date,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdBy: actor?.id ?? null,
    })
    .returning();
  const entry = await postJournal(db, actor, {
    date: input.date,
    memo: `Transfer ${from.name} → ${to.name}${input.reference ? ` (${input.reference})` : ""}`,
    sourceType: "bank_transfer",
    sourceId: row.id,
    sourceNumber: number,
    lines: [
      { account: to.id, debit: amount },
      { account: from.id, credit: amount },
    ],
  });
  await db.update(bankTransfers).set({ journalEntryId: entry.id }).where(eq(bankTransfers.id, row.id));
  await logAudit(db, actor, { action: "post", entity: "bank_transfer", entityId: row.id, summary: `Transfer ${number}: ${amount} from ${from.name} to ${to.name}` });
  return { id: row.id, number };
}

export async function voidTransfer(db: DbOrTx, actor: Actor | null, input: { id: string; reason?: string | null }) {
  const [row] = await db.select().from(bankTransfers).where(eq(bankTransfers.id, input.id));
  if (!row) throw new AppError("Transfer not found");
  if (row.status === "void") throw new AppError("This transfer is already void");
  // Taking the money back out of the receiving account must not leave physical cash negative
  const [to] = await db.select().from(accounts).where(eq(accounts.id, row.toAccountId));
  if (to) await assertCashAvailable(db, to, row.amount, row.date);
  await voidJournal(db, actor, row.journalEntryId, input.reason ?? `Transfer ${row.number} voided`);
  await db.update(bankTransfers).set({ status: "void" }).where(eq(bankTransfers.id, row.id));
  await logAudit(db, actor, { action: "void", entity: "bank_transfer", entityId: row.id, summary: `Voided transfer ${row.number}${input.reason ? `: ${input.reason}` : ""}` });
  return { id: row.id };
}
