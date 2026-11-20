import type { AccountSubtype, AccountType } from "@/db/schema";

// Codes of the system accounts that automatic postings use. Users can add more accounts freely;
// these must keep existing (they are flagged is_system and can't be deleted).
export const ACC = {
  CASH: "1110",
  PETTY_CASH: "1120",
  BANK: "1210",
  RECEIVABLE: "1300",
  INVENTORY: "1400",
  EMPLOYEE_ADVANCES: "1500",
  INPUT_TAX: "1600",
  PAYABLE: "2100",
  GRNI: "2150",
  OUTPUT_TAX: "2200",
  SALARIES_PAYABLE: "2300",
  CAPITAL: "3100",
  RETAINED_EARNINGS: "3200",
  OPENING_BALANCE: "3300",
  SALES: "4100",
  SALES_RETURNS: "4200",
  OTHER_INCOME: "4300",
  COGS: "5100",
  INVENTORY_ADJUSTMENT: "5200",
  SALARIES: "6100",
  DISCOUNT_ALLOWED: "6600",
  GENERAL_EXPENSE: "6900",
} as const;

export interface AccountSeed {
  code: string;
  name: string;
  type: AccountType;
  subtype?: AccountSubtype;
  parent?: string; // parent code
  group?: boolean;
  system?: boolean;
}

export const DEFAULT_CHART: AccountSeed[] = [
  // Assets
  { code: "1000", name: "Assets", type: "asset", group: true, system: true },
  { code: "1100", name: "Cash", type: "asset", parent: "1000", group: true, system: true },
  { code: "1110", name: "Cash in Hand", type: "asset", subtype: "cash", parent: "1100", system: true },
  { code: "1120", name: "Petty Cash - Main", type: "asset", subtype: "petty_cash", parent: "1100", system: true },
  { code: "1200", name: "Bank Accounts", type: "asset", parent: "1000", group: true, system: true },
  { code: "1210", name: "Main Bank Account", type: "asset", subtype: "bank", parent: "1200", system: true },
  { code: "1300", name: "Accounts Receivable", type: "asset", subtype: "receivable", parent: "1000", system: true },
  { code: "1400", name: "Inventory", type: "asset", subtype: "inventory", parent: "1000", system: true },
  { code: "1500", name: "Employee Advances & Loans", type: "asset", subtype: "employee_advance", parent: "1000", system: true },
  { code: "1600", name: "Input Sales Tax", type: "asset", subtype: "tax_input", parent: "1000", system: true },
  { code: "1700", name: "Fixed Assets", type: "asset", parent: "1000", group: true },
  { code: "1710", name: "Furniture & Fixtures", type: "asset", subtype: "fixed_asset", parent: "1700" },
  { code: "1720", name: "Equipment & Computers", type: "asset", subtype: "fixed_asset", parent: "1700" },
  { code: "1730", name: "Vehicles", type: "asset", subtype: "fixed_asset", parent: "1700" },
  { code: "1790", name: "Accumulated Depreciation", type: "asset", subtype: "accumulated_depreciation", parent: "1700" },
  { code: "1800", name: "Security Deposits & Prepayments", type: "asset", subtype: "other_asset", parent: "1000" },

  // Liabilities
  { code: "2000", name: "Liabilities", type: "liability", group: true, system: true },
  { code: "2100", name: "Accounts Payable", type: "liability", subtype: "payable", parent: "2000", system: true },
  { code: "2150", name: "Goods Received Not Invoiced", type: "liability", subtype: "goods_received_not_invoiced", parent: "2000", system: true },
  { code: "2200", name: "Output Sales Tax", type: "liability", subtype: "tax_output", parent: "2000", system: true },
  { code: "2300", name: "Salaries Payable", type: "liability", subtype: "salaries_payable", parent: "2000", system: true },
  { code: "2400", name: "Customer Advances", type: "liability", subtype: "other_liability", parent: "2000" },
  { code: "2500", name: "Loans Payable", type: "liability", subtype: "other_liability", parent: "2000" },
  { code: "2600", name: "Accrued Expenses", type: "liability", subtype: "other_liability", parent: "2000" },

  // Equity
  { code: "3000", name: "Equity", type: "equity", group: true, system: true },
  { code: "3100", name: "Owner's Capital", type: "equity", subtype: "equity", parent: "3000", system: true },
  { code: "3150", name: "Owner's Drawings", type: "equity", subtype: "equity", parent: "3000" },
  { code: "3200", name: "Retained Earnings", type: "equity", subtype: "retained_earnings", parent: "3000", system: true },
  { code: "3300", name: "Opening Balance Equity", type: "equity", subtype: "opening_balance", parent: "3000", system: true },

  // Income
  { code: "4000", name: "Income", type: "income", group: true, system: true },
  { code: "4100", name: "Sales Revenue", type: "income", subtype: "sales", parent: "4000", system: true },
  { code: "4200", name: "Sales Returns & Allowances", type: "income", subtype: "sales_returns", parent: "4000", system: true },
  { code: "4300", name: "Other Income", type: "income", subtype: "other_income", parent: "4000", system: true },
  { code: "4400", name: "Discount Received", type: "income", subtype: "other_income", parent: "4000" },

  // Cost of sales
  { code: "5000", name: "Cost of Sales", type: "expense", group: true, system: true },
  { code: "5100", name: "Cost of Goods Sold", type: "expense", subtype: "cogs", parent: "5000", system: true },
  { code: "5200", name: "Inventory Adjustments & Shrinkage", type: "expense", subtype: "inventory_adjustment", parent: "5000", system: true },
  { code: "5300", name: "Freight In", type: "expense", subtype: "cogs", parent: "5000" },

  // Operating expenses
  { code: "6000", name: "Operating Expenses", type: "expense", group: true, system: true },
  { code: "6100", name: "Salaries & Wages", type: "expense", subtype: "salaries", parent: "6000", system: true },
  { code: "6200", name: "Rent", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6300", name: "Electricity, Gas & Water", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6350", name: "Internet & Telephone", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6400", name: "Transport & Delivery", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6450", name: "Fuel", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6500", name: "Office Supplies & Stationery", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6550", name: "Tea, Meals & Entertainment", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6600", name: "Discount Allowed", type: "expense", subtype: "discount", parent: "6000", system: true },
  { code: "6650", name: "Marketing & Advertising", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6700", name: "Bank Charges", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6750", name: "Repairs & Maintenance", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6800", name: "Depreciation", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6850", name: "Packaging Material", type: "expense", subtype: "expense", parent: "6000" },
  { code: "6900", name: "General & Miscellaneous", type: "expense", subtype: "expense", parent: "6000", system: true },
];

/** Normal balance side: assets and expenses grow with debits, the rest with credits. */
export const isDebitNormal = (type: AccountType) => type === "asset" || type === "expense";
