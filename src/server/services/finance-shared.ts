// Accounting & Finance: input schemas, labels and small pure helpers.
// Shared by server (services, actions) and client (forms). Keep free of database imports.
import { z } from "zod";
// Type-only import so client bundles don't pull in the table definitions
import type { AccountSubtype, AccountType, JournalSource } from "@/db/schema/accounting";
import { zDay, zId, zMoney, zOptText } from "@/lib/schemas";
import { addDays, dayString, endOfMonth, parseDay } from "@/lib/format";

// ---- Accounts ---------------------------------------------------------------------------------

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

/** Which account type each subtype belongs to (a subtype is only valid for its own type). */
export const SUBTYPE_TYPE: Record<AccountSubtype, AccountType> = {
  cash: "asset",
  bank: "asset",
  petty_cash: "asset",
  receivable: "asset",
  inventory: "asset",
  employee_advance: "asset",
  tax_input: "asset",
  fixed_asset: "asset",
  accumulated_depreciation: "asset",
  other_asset: "asset",
  payable: "liability",
  goods_received_not_invoiced: "liability",
  tax_output: "liability",
  salaries_payable: "liability",
  other_liability: "liability",
  equity: "equity",
  retained_earnings: "equity",
  opening_balance: "equity",
  sales: "income",
  sales_returns: "income",
  other_income: "income",
  cogs: "expense",
  inventory_adjustment: "expense",
  expense: "expense",
  salaries: "expense",
  discount: "expense",
};

export const SUBTYPE_LABELS: Record<AccountSubtype, string> = {
  cash: "Cash",
  bank: "Bank / wallet",
  petty_cash: "Petty cash",
  receivable: "Receivable",
  inventory: "Inventory",
  employee_advance: "Employee advances",
  tax_input: "Input tax",
  fixed_asset: "Fixed asset",
  accumulated_depreciation: "Accumulated depreciation",
  other_asset: "Other asset",
  payable: "Payable",
  goods_received_not_invoiced: "Goods received not invoiced",
  tax_output: "Output tax",
  salaries_payable: "Salaries payable",
  other_liability: "Other liability",
  equity: "Capital / equity",
  retained_earnings: "Retained earnings",
  opening_balance: "Opening balance equity",
  sales: "Sales",
  sales_returns: "Sales returns",
  other_income: "Other income",
  cogs: "Cost of sales",
  inventory_adjustment: "Inventory adjustment",
  expense: "Operating expense",
  salaries: "Salaries",
  discount: "Discount",
};

/** Subtypes that make an account a money register (cash book). */
export const CASH_SUBTYPES = ["cash", "bank", "petty_cash"] as const satisfies readonly AccountSubtype[];
export const isCashSubtype = (s: string | null | undefined) => !!s && (CASH_SUBTYPES as readonly string[]).includes(s);

export const SUBTYPES = Object.keys(SUBTYPE_TYPE) as [AccountSubtype, ...AccountSubtype[]];

export const subtypesFor = (type: AccountType) => SUBTYPES.filter((s) => SUBTYPE_TYPE[s] === type);

export const ACCOUNT_CODE_RE = /^\d{3,6}$/;

export const accountSchema = z.object({
  id: z.string().optional(),
  parentId: z.string().nullable().optional(), // required when creating; root groups have none
  code: z.string().trim().regex(ACCOUNT_CODE_RE, "Use 3 to 6 digits"),
  name: z.string().trim().min(2, "Enter a name"),
  subtype: z.enum(SUBTYPES).nullable().optional(),
  isGroup: z.boolean().default(false),
  description: zOptText,
});
export type AccountInput = z.infer<typeof accountSchema>;

// ---- Journals ---------------------------------------------------------------------------------

export const PARTY_TYPES = ["customer", "supplier", "employee"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const journalLineSchema = z.object({
  accountId: zId,
  debit: zMoney.default(0),
  credit: zMoney.default(0),
  partyType: z.enum(PARTY_TYPES).nullable().optional(),
  partyId: z.string().nullable().optional(),
  memo: zOptText,
});

export const manualJournalSchema = z.object({
  date: zDay,
  memo: z.string().trim().min(1, "Describe what this entry is for"),
  isOpening: z.boolean().default(false),
  lines: z.array(journalLineSchema).min(2, "Add at least two lines"),
});
type JournalLine = z.infer<typeof journalLineSchema>;
export type ManualJournalInput = Omit<z.infer<typeof manualJournalSchema>, "lines" | "isOpening"> & {
  isOpening?: boolean;
  lines: (Omit<JournalLine, "memo"> & { memo?: string | null })[];
};

export const voidSchema = z.object({ id: zId, reason: zOptText });

// ---- Cash & bank ------------------------------------------------------------------------------

export const bankAccountSchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  kind: z.enum(["cash", "bank", "wallet"]),
  bankName: zOptText,
  accountTitle: zOptText,
  accountNumber: zOptText,
  iban: zOptText,
  branch: zOptText,
  openingBalance: zMoney.default(0),
  openingDate: zDay.optional(),
});
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

export const transferSchema = z.object({
  date: zDay,
  fromAccountId: zId,
  toAccountId: zId,
  amount: z.coerce.number().finite().positive("Enter an amount"),
  reference: zOptText,
  notes: zOptText,
});
export type TransferInput = z.infer<typeof transferSchema>;

// ---- Petty cash -------------------------------------------------------------------------------

export const fundSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Enter a name"),
  custodianName: zOptText,
  floatAmount: zMoney.default(0),
});
export type FundInput = z.infer<typeof fundSchema>;

export const voucherSchema = z.object({
  fundId: zId,
  date: zDay,
  type: z.enum(["expense", "topup"]),
  accountId: zId, // expense account, or the cash/bank account a top-up comes from
  amount: z.coerce.number().finite().positive("Enter an amount"),
  payee: zOptText,
  description: z.string().trim().min(1, "Describe what the money was for"),
  receiptRef: zOptText,
});
export type VoucherInput = z.infer<typeof voucherSchema>;

// ---- Expenses ---------------------------------------------------------------------------------

export const expenseSchema = z.object({
  date: zDay,
  expenseAccountId: zId,
  paidFromAccountId: zId,
  amount: z.coerce.number().finite().positive("Enter an amount"),
  taxAmount: zMoney.default(0),
  payee: zOptText,
  supplierId: zOptText,
  description: z.string().trim().min(1, "Describe the expense"),
  reference: zOptText,
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

// ---- Close books ------------------------------------------------------------------------------

export const lockDateSchema = z.object({ lockDate: zDay.nullable() });

// ---- Journal sources --------------------------------------------------------------------------

export const SOURCE_LABELS: Record<JournalSource, string> = {
  manual: "Manual journal",
  opening: "Opening balance",
  sales_invoice: "Sales invoice",
  sales_return: "Sales return",
  customer_receipt: "Customer receipt",
  goods_receipt: "Goods receipt",
  supplier_bill: "Supplier bill",
  purchase_return: "Purchase return",
  supplier_payment: "Supplier payment",
  stock_adjustment: "Stock adjustment",
  stock_count: "Stock count",
  expense: "Expense",
  petty_cash: "Petty cash",
  bank_transfer: "Bank transfer",
  payroll: "Payroll",
  salary_payment: "Salary payment",
  employee_advance: "Employee advance",
};

/** Journals the user can void directly; the rest belong to a document and are voided from it. */
export const USER_VOIDABLE_SOURCES: JournalSource[] = ["manual", "opening"];

const SOURCE_ROUTES: Partial<Record<JournalSource, string>> = {
  sales_invoice: "/sales/invoices",
  sales_return: "/sales/returns",
  customer_receipt: "/sales/receipts",
  goods_receipt: "/purchasing/receipts",
  supplier_bill: "/purchasing/bills",
  purchase_return: "/purchasing/returns",
  supplier_payment: "/purchasing/payments",
  stock_adjustment: "/inventory/adjustments",
  stock_count: "/inventory/counts",
  expense: "/accounting/expenses",
  petty_cash: "/accounting/petty-cash",
  bank_transfer: "/accounting/banking/transfers",
  payroll: "/hr/payroll",
  employee_advance: "/hr/advances",
};

/** Link to the document behind a journal, when we know where it lives. */
export function sourceHref(sourceType: string, sourceId: string | null | undefined): string | null {
  if (sourceType === "salary_payment") return "/hr/payroll";
  const base = SOURCE_ROUTES[sourceType as JournalSource];
  return base && sourceId ? `${base}/${sourceId}` : null;
}

// ---- Periods ----------------------------------------------------------------------------------

/**
 * The comparison period for a P&L: the same number of whole months before, when the range is
 * whole calendar months; otherwise the same number of days immediately before.
 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = parseDay(from);
  const wholeMonths = from.endsWith("-01") && to === endOfMonth(to);
  if (wholeMonths) {
    const t = parseDay(to);
    const months = (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth()) + 1;
    const pFrom = dayString(new Date(f.getFullYear(), f.getMonth() - months, 1));
    const pTo = dayString(new Date(f.getFullYear(), f.getMonth(), 0));
    return { from: pFrom, to: pTo };
  }
  const days = Math.round((parseDay(to).getTime() - f.getTime()) / 86_400_000) + 1;
  const pTo = addDays(from, -1);
  return { from: addDays(pTo, -(days - 1)), to: pTo };
}

export const pctChange = (current: number, previous: number): number | null =>
  previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;

// ---- Financial statements ---------------------------------------------------------------------

export const STATEMENT_TABS = [
  { value: "tb", label: "Trial Balance" },
  { value: "pnl", label: "Profit & Loss" },
  { value: "bs", label: "Balance Sheet" },
  { value: "cf", label: "Cash Flow" },
] as const;
