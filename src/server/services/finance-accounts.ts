// Chart of accounts maintenance + small helpers the other finance services share.
import { and, eq, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { accounts, bankAccounts, journalLines, pettyCashFunds } from "@/db/schema";
import { formatMoney } from "@/lib/format";
import { AppError } from "../errors";
import { accountBalance, getAccountByCode } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { SUBTYPE_TYPE, SUBTYPE_LABELS, isCashSubtype, type AccountInput } from "./finance-shared";

export type AccountRow = typeof accounts.$inferSelect;

export async function getAccount(db: DbOrTx, id: string): Promise<AccountRow> {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!row) throw new AppError("Account not found");
  return row;
}

/** A postable, active account, optionally restricted to some types / subtypes. */
export async function getPostableAccount(
  db: DbOrTx,
  id: string,
  opts: { types?: AccountRow["type"][]; subtypes?: readonly string[]; what?: string } = {}
) {
  const acc = await getAccount(db, id);
  const what = opts.what ?? "account";
  if (acc.isGroup) throw new AppError(`"${acc.name}" is a header account. Choose an ${what} under it.`);
  if (!acc.isActive) throw new AppError(`"${acc.name}" is inactive`);
  if (opts.types && !opts.types.includes(acc.type)) throw new AppError(`"${acc.name}" is not a valid ${what}`);
  if (opts.subtypes && !opts.subtypes.includes(acc.subtype ?? "")) throw new AppError(`"${acc.name}" is not a valid ${what}`);
  return acc;
}

export async function accountHasPostings(db: DbOrTx, accountId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(journalLines)
    .where(eq(journalLines.accountId, accountId));
  return row.n > 0;
}

/**
 * Physical cash (cash in hand, petty cash) can't go below zero. Bank accounts may be overdrawn.
 * Checks the balance on the date and today, whichever is lower.
 */
export async function assertCashAvailable(db: DbOrTx, acc: AccountRow, amount: number, date: string) {
  if (acc.subtype !== "cash" && acc.subtype !== "petty_cash") return;
  const onDate = await accountBalance(db, acc.id, { to: date });
  const now = await accountBalance(db, acc.id);
  const available = Math.min(onDate, now);
  if (amount > available + 0.001) {
    throw new AppError(`Not enough money in ${acc.name}: available ${formatMoney(available, { fixed: true })}, needed ${formatMoney(amount, { fixed: true })}.`);
  }
}

/** Next free code under a group: parent 1200 with 1210 used gives 1220 (steps of 10, then 1). */
export async function nextChildCode(db: DbOrTx, parent: AccountRow): Promise<string> {
  const used = new Set((await db.select({ code: accounts.code }).from(accounts)).map((r) => r.code));
  const base = Number(parent.code);
  const span = parent.code.endsWith("000") ? 1000 : parent.code.endsWith("00") ? 100 : 10;
  for (const step of [10, 1]) {
    for (let c = base + step; c < base + span; c += step) {
      if (!used.has(String(c))) return String(c);
    }
  }
  throw new AppError(`No free account codes left under ${parent.code} ${parent.name}`);
}

async function assertParent(db: DbOrTx, parentId: string | null | undefined) {
  if (!parentId) throw new AppError("Choose the group this account belongs to", { parentId: "Required" });
  const parent = await getAccount(db, parentId);
  if (!parent.isGroup) throw new AppError("The parent must be a header (group) account", { parentId: "Choose a header account" });
  return parent;
}

async function assertCodeFree(db: DbOrTx, code: string, exceptId?: string) {
  const [dupe] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(exceptId ? and(eq(accounts.code, code), ne(accounts.id, exceptId)) : eq(accounts.code, code));
  if (dupe) throw new AppError(`Account code ${code} is already used`, { code: "This code is already used" });
}

function assertSubtype(type: AccountRow["type"], subtype: AccountInput["subtype"]) {
  if (subtype && SUBTYPE_TYPE[subtype] !== type) {
    throw new AppError(`"${SUBTYPE_LABELS[subtype]}" doesn't fit a ${type} account`, { subtype: "Not valid for this account type" });
  }
}

/** Cash/bank accounts get a Cash & Bank register; petty cash accounts get a fund. */
async function ensureRegister(db: DbOrTx, acc: AccountRow) {
  if (acc.isGroup) return;
  if (acc.subtype === "cash" || acc.subtype === "bank") {
    const [existing] = await db.select().from(bankAccounts).where(eq(bankAccounts.accountId, acc.id));
    if (!existing) await db.insert(bankAccounts).values({ accountId: acc.id, name: acc.name, kind: acc.subtype });
  } else if (acc.subtype === "petty_cash") {
    const [existing] = await db.select().from(pettyCashFunds).where(eq(pettyCashFunds.accountId, acc.id));
    if (!existing) await db.insert(pettyCashFunds).values({ accountId: acc.id, name: acc.name, floatAmount: 0 });
  }
}

export async function createAccount(db: DbOrTx, actor: Actor | null, input: AccountInput) {
  const parent = await assertParent(db, input.parentId);
  await assertCodeFree(db, input.code);
  const subtype = input.isGroup ? null : (input.subtype ?? null);
  assertSubtype(parent.type, subtype);

  const [acc] = await db
    .insert(accounts)
    .values({
      code: input.code,
      name: input.name,
      type: parent.type, // inherited from the parent group
      subtype,
      parentId: parent.id,
      isGroup: input.isGroup,
      description: input.description ?? null,
    })
    .returning();
  await ensureRegister(db, acc);
  await logAudit(db, actor, { action: "create", entity: "account", entityId: acc.id, summary: `Created account ${acc.code} ${acc.name}` });
  return acc;
}

function isDescendant(all: AccountRow[], candidateId: string, ancestorId: string) {
  const byId = new Map(all.map((a) => [a.id, a]));
  let cur = byId.get(candidateId);
  while (cur) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

export async function updateAccount(db: DbOrTx, actor: Actor | null, input: AccountInput & { id: string }) {
  const acc = await getAccount(db, input.id);
  const subtype = acc.isGroup ? null : (input.subtype ?? null);
  const changes: Partial<AccountRow> = { name: input.name, description: input.description ?? null };

  if (acc.isSystem) {
    // System accounts are used by automatic postings: keep their code, place and behaviour
    if (input.code !== acc.code) throw new AppError("The code of a system account can't be changed", { code: "System account" });
    if (input.parentId && input.parentId !== acc.parentId) throw new AppError("A system account can't be moved to another group");
    if (subtype !== acc.subtype) throw new AppError("The subtype of a system account can't be changed", { subtype: "System account" });
  } else {
    if (input.code !== acc.code) {
      await assertCodeFree(db, input.code, acc.id);
      changes.code = input.code;
    }
    if (input.parentId && input.parentId !== acc.parentId) {
      const parent = await assertParent(db, input.parentId);
      const all = await db.select().from(accounts);
      if (isDescendant(all, parent.id, acc.id)) throw new AppError("An account can't be moved under itself");
      if (parent.type !== acc.type) {
        const hasChildren = all.some((a) => a.parentId === acc.id);
        if (hasChildren || (await accountHasPostings(db, acc.id))) {
          throw new AppError(`This account already has postings or sub-accounts, so it can't move from ${acc.type} to ${parent.type}`);
        }
        changes.type = parent.type;
      }
      changes.parentId = parent.id;
    }
    const type = changes.type ?? acc.type;
    assertSubtype(type, subtype);
    if (subtype !== acc.subtype) {
      if (isCashSubtype(acc.subtype) && (await accountHasPostings(db, acc.id))) {
        throw new AppError("This cash/bank account already has postings, so its subtype can't be changed");
      }
      if (isCashSubtype(acc.subtype)) {
        // No postings: drop the now-unneeded register
        await db.delete(bankAccounts).where(eq(bankAccounts.accountId, acc.id));
        await db.delete(pettyCashFunds).where(eq(pettyCashFunds.accountId, acc.id));
      }
      changes.subtype = subtype;
    }
  }

  const [updated] = await db.update(accounts).set(changes).where(eq(accounts.id, acc.id)).returning();
  await ensureRegister(db, updated);
  await logAudit(db, actor, { action: "update", entity: "account", entityId: acc.id, summary: `Updated account ${updated.code} ${updated.name}` });
  return updated;
}

export async function setAccountActive(db: DbOrTx, actor: Actor | null, input: { id: string; active: boolean }) {
  const acc = await getAccount(db, input.id);
  if (!input.active) {
    if (acc.isSystem) throw new AppError("System accounts are used by automatic postings and can't be deactivated");
    if (acc.isGroup) {
      const [child] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.parentId, acc.id), eq(accounts.isActive, true)));
      if (child) throw new AppError("Deactivate the accounts under this group first");
    } else {
      const balance = await accountBalance(db, acc.id);
      if (balance !== 0) throw new AppError(`This account still has a balance of ${formatMoney(balance, { fixed: true })}. Clear it before deactivating.`);
    }
  }
  await db.update(accounts).set({ isActive: input.active }).where(eq(accounts.id, acc.id));
  await db.update(bankAccounts).set({ isActive: input.active }).where(eq(bankAccounts.accountId, acc.id));
  await db.update(pettyCashFunds).set({ isActive: input.active }).where(eq(pettyCashFunds.accountId, acc.id));
  await logAudit(db, actor, {
    action: input.active ? "activate" : "deactivate",
    entity: "account",
    entityId: acc.id,
    summary: `${input.active ? "Reactivated" : "Deactivated"} account ${acc.code} ${acc.name}`,
  });
}

export async function deleteAccount(db: DbOrTx, actor: Actor | null, id: string) {
  const acc = await getAccount(db, id);
  if (acc.isSystem) throw new AppError("System accounts can't be deleted");
  const [child] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.parentId, acc.id));
  if (child) throw new AppError("This group still has accounts under it");
  if (await accountHasPostings(db, acc.id)) {
    throw new AppError("This account has postings, so it can't be deleted. Deactivate it instead.");
  }
  await db.delete(bankAccounts).where(eq(bankAccounts.accountId, acc.id));
  await db.delete(pettyCashFunds).where(eq(pettyCashFunds.accountId, acc.id));
  await db.delete(accounts).where(eq(accounts.id, acc.id));
  await logAudit(db, actor, { action: "delete", entity: "account", entityId: acc.id, summary: `Deleted account ${acc.code} ${acc.name}` });
}

export { getAccountByCode };
