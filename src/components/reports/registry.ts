import {
  AlarmClock,
  Boxes,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  HandCoins,
  History,
  Landmark,
  type LucideIcon,
  Package,
  PackageSearch,
  PieChart,
  ReceiptText,
  Scale,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { hasPermission, type Permission } from "@/lib/permissions";

export type ReportGroup = "Sales" | "Purchasing" | "Inventory" | "Finance" | "HR";

export interface ReportDef {
  slug: string;
  title: string;
  description: string;
  group: ReportGroup;
  icon: LucideIcon;
  /** Needed on top of reports.view */
  permission?: Permission | Permission[];
}

export const REPORT_GROUPS: { group: ReportGroup; description: string }[] = [
  { group: "Sales", description: "What sold, to whom and by whom" },
  { group: "Purchasing", description: "What you bought and from which suppliers" },
  { group: "Inventory", description: "Stock value, movement and what to reorder" },
  { group: "Finance", description: "Money owed, tax, expenses and cash" },
  { group: "HR", description: "Salaries and payroll" },
];

export const REPORTS: ReportDef[] = [
  { slug: "sales-summary", title: "Sales summary", description: "Invoices, gross, discounts, net, tax and returns by day or month.", group: "Sales", icon: CalendarDays },
  { slug: "sales-by-product", title: "Sales by product", description: "Quantity, revenue, cost, profit and margin for each product.", group: "Sales", icon: Package },
  { slug: "sales-by-customer", title: "Sales by customer", description: "Who buys the most, with returns and what is still unpaid.", group: "Sales", icon: Users },
  { slug: "sales-by-category", title: "Sales by category", description: "Revenue and margin by product category, with each one's share.", group: "Sales", icon: PieChart },
  { slug: "sales-by-salesperson", title: "Sales by salesperson", description: "Invoices, net sales and profit per salesperson.", group: "Sales", icon: UserRound },
  { slug: "purchases-by-supplier", title: "Purchases by supplier", description: "Bills, tax, freight, returns and balance owed per supplier.", group: "Purchasing", icon: Truck },
  { slug: "purchases-by-product", title: "Purchases by product", description: "Quantity bought, value and average cost per product.", group: "Purchasing", icon: PackageSearch },
  { slug: "inventory-valuation", title: "Inventory valuation", description: "Stock on hand × average cost, by product, warehouse and category.", group: "Inventory", icon: Boxes, permission: "inventory.cost" },
  { slug: "reorder", title: "Reorder list", description: "Products at or below reorder level, with a suggested order quantity.", group: "Inventory", icon: ClipboardList },
  { slug: "stock-movement-summary", title: "Stock movement summary", description: "Opening, in, out and closing quantity per product for a period.", group: "Inventory", icon: History },
  { slug: "aged-receivables", title: "Aged receivables", description: "Unpaid customer invoices grouped by how long they are overdue.", group: "Finance", icon: HandCoins },
  { slug: "aged-payables", title: "Aged payables", description: "Unpaid supplier bills grouped by how long they are overdue.", group: "Finance", icon: AlarmClock },
  { slug: "tax-summary", title: "Sales tax summary", description: "Output tax on sales against input tax on purchases → net payable.", group: "Finance", icon: Scale, permission: "accounting.view" },
  { slug: "expense-by-category", title: "Expenses by category", description: "Spending per expense account for the period, with share of total.", group: "Finance", icon: ReceiptText, permission: "accounting.view" },
  { slug: "daily-cash", title: "Daily cash & bank", description: "Opening, receipts, payments and closing balance for each day.", group: "Finance", icon: Landmark, permission: "accounting.view" },
  { slug: "payroll-summary", title: "Payroll summary", description: "Gross, deductions, net and paid for each payroll run.", group: "HR", icon: FileSpreadsheet, permission: "hr.payroll" },
];


export const findReport = (slug: string) => REPORTS.find((r) => r.slug === slug);

export const canSeeReport = (granted: readonly string[], r: ReportDef) =>
  hasPermission(granted, "reports.view") && (!r.permission || hasPermission(granted, r.permission));
