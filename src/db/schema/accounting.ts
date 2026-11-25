import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, day, id, money } from "./_helpers";
import { users } from "./core";

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// Subtypes drive behaviour (which accounts can receive payments, show in cash book, etc.)
export const ACCOUNT_SUBTYPES = [
  "cash",
  "bank",
  "petty_cash",
  "receivable",
  "payable",
  "inventory",
  "goods_received_not_invoiced",
  "employee_advance",
  "tax_input",
  "tax_output",
  "salaries_payable",
  "fixed_asset",
  "accumulated_depreciation",
  "other_asset",
  "other_liability",
  "equity",
  "retained_earnings",
  "opening_balance",
  "sales",
  "sales_returns",
  "other_income",
  "cogs",
  "inventory_adjustment",
  "expense",
  "salaries",
  "discount",
] as const;
export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[number];

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
    subtype: text("subtype", { enum: ACCOUNT_SUBTYPES }),
    parentId: text("parent_id"),
    isGroup: boolean("is_group").notNull().default(false), // headers can't receive postings
    isSystem: boolean("is_system").notNull().default(false), // used by automatic postings, can't be deleted
    isActive: boolean("is_active").notNull().default(true),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [index("accounts_type_idx").on(t.type)]
);

export const JOURNAL_SOURCES = [
  "manual",
  "opening",
  "sales_invoice",
  "sales_return",
  "customer_receipt",
  "goods_receipt",
  "supplier_bill",
  "purchase_return",
  "supplier_payment",
  "stock_adjustment",
  "stock_count",
  "production",
  "expense",
  "petty_cash",
  "bank_transfer",
  "payroll",
  "salary_payment",
  "employee_advance",
] as const;
export type JournalSource = (typeof JOURNAL_SOURCES)[number];

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: id(),
    number: text("number").notNull().unique(),
    date: day("date").notNull(),
    memo: text("memo"),
    sourceType: text("source_type", { enum: JOURNAL_SOURCES }).notNull().default("manual"),
    sourceId: text("source_id"),
    sourceNumber: text("source_number"), // e.g. SI-00012, for display
    status: text("status", { enum: ["posted", "void"] }).notNull().default("posted"),
    total: money("total").notNull().default(0),
    reversalOfId: text("reversal_of_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("je_date_idx").on(t.date), index("je_source_idx").on(t.sourceType, t.sourceId)]
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: id(),
    entryId: text("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull().default(0),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    debit: money("debit").notNull().default(0),
    credit: money("credit").notNull().default(0),
    // Sub-ledger link so customer/supplier/employee statements come straight from the GL
    partyType: text("party_type", { enum: ["customer", "supplier", "employee"] }),
    partyId: text("party_id"),
    memo: text("memo"),
    // Denormalised copy of the entry date for fast ledger/period queries
    date: day("date").notNull(),
  },
  (t) => [
    index("jl_account_idx").on(t.accountId, t.date),
    index("jl_party_idx").on(t.partyType, t.partyId),
    index("jl_entry_idx").on(t.entryId),
  ]
);

// Cash and bank registers shown in the Cash & Bank module. Each maps to one GL account.
export const bankAccounts = pgTable("bank_accounts", {
  id: id(),
  accountId: text("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["cash", "bank", "wallet"] }).notNull().default("bank"),
  bankName: text("bank_name"),
  accountTitle: text("account_title"),
  accountNumber: text("account_number"),
  iban: text("iban"),
  branch: text("branch"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

// Money moved between two cash/bank accounts (deposit, withdrawal, transfer)
export const bankTransfers = pgTable("bank_transfers", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  fromAccountId: text("from_account_id")
    .notNull()
    .references(() => accounts.id),
  toAccountId: text("to_account_id")
    .notNull()
    .references(() => accounts.id),
  amount: money("amount").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  status: text("status", { enum: ["posted", "void"] }).notNull().default("posted"),
  journalEntryId: text("journal_entry_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const pettyCashFunds = pgTable("petty_cash_funds", {
  id: id(),
  name: text("name").notNull(),
  accountId: text("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id), // a petty_cash subtype GL account per fund
  custodianName: text("custodian_name"),
  floatAmount: money("float_amount").notNull().default(0), // imprest level to top back up to
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const pettyCashVouchers = pgTable(
  "petty_cash_vouchers",
  {
    id: id(),
    number: text("number").notNull().unique(),
    date: day("date").notNull(),
    fundId: text("fund_id")
      .notNull()
      .references(() => pettyCashFunds.id),
    // expense: money spent from the fund; topup: money added to the fund from cash/bank
    type: text("type", { enum: ["expense", "topup"] }).notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id), // expense account, or source cash/bank account for top-ups
    amount: money("amount").notNull(),
    payee: text("payee"),
    description: text("description").notNull(),
    receiptRef: text("receipt_ref"),
    status: text("status", { enum: ["posted", "void"] }).notNull().default("posted"),
    journalEntryId: text("journal_entry_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("pcv_fund_idx").on(t.fundId, t.date)]
);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    number: text("number").notNull().unique(),
    date: day("date").notNull(),
    expenseAccountId: text("expense_account_id")
      .notNull()
      .references(() => accounts.id),
    paidFromAccountId: text("paid_from_account_id")
      .notNull()
      .references(() => accounts.id), // cash / bank / petty cash
    amount: money("amount").notNull(),
    taxAmount: money("tax_amount").notNull().default(0),
    payee: text("payee"),
    supplierId: text("supplier_id"),
    description: text("description").notNull(),
    reference: text("reference"),
    status: text("status", { enum: ["posted", "void"] }).notNull().default("posted"),
    journalEntryId: text("journal_entry_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_date_idx").on(t.date)]
);

export const budgets = pgTable("budgets", {
  id: id(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  period: text("period").notNull(), // YYYY-MM
  amount: money("amount").notNull(),
  createdAt: createdAt(),
});
