import {
  ArrowLeftRight,
  BadgeDollarSign,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HandCoins,
  History,
  Landmark,
  LayoutDashboard,
  Layers,
  LineChart,
  ListTree,
  type LucideIcon,
  Package,
  PackageCheck,
  FileClock,
  Plane,
  Receipt,
  ReceiptText,
  RotateCcw,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission | Permission[];
  keywords?: string; // extra words for the command search
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/", icon: LayoutDashboard, permission: "dashboard.view" },
      { title: "Reports", href: "/reports", icon: BarChart3, permission: "reports.view", keywords: "analytics sales report profit" },
    ],
  },
  {
    title: "Sales",
    items: [
      { title: "Point of Sale", href: "/sales/pos", icon: Store, permission: "sales.pos", keywords: "pos counter checkout" },
      { title: "Quotations", href: "/sales/quotations", icon: FileText, permission: "sales.view", keywords: "estimate quote" },
      { title: "Sales Orders", href: "/sales/orders", icon: ClipboardList, permission: "sales.view", keywords: "booking order" },
      { title: "Invoices", href: "/sales/invoices", icon: ReceiptText, permission: "sales.view", keywords: "bill sale" },
      { title: "Receipts", href: "/sales/receipts", icon: HandCoins, permission: ["sales.receipts", "sales.view"], keywords: "payment received collection" },
      { title: "Sales Returns", href: "/sales/returns", icon: RotateCcw, permission: "sales.view", keywords: "credit note refund" },
      { title: "Customers", href: "/sales/customers", icon: Users, permission: "parties.view", keywords: "clients ledger receivable" },
    ],
  },
  {
    title: "Purchasing",
    items: [
      { title: "Purchase Orders", href: "/purchasing/orders", icon: ShoppingCart, permission: "purchasing.view", keywords: "po" },
      { title: "Goods Receipts", href: "/purchasing/receipts", icon: PackageCheck, permission: "purchasing.view", keywords: "grn receiving" },
      { title: "Supplier Bills", href: "/purchasing/bills", icon: FileCheck2, permission: "purchasing.view", keywords: "purchase invoice" },
      { title: "Supplier Payments", href: "/purchasing/payments", icon: BadgeDollarSign, permission: ["purchasing.payments", "purchasing.view"], keywords: "pay vendor" },
      { title: "Purchase Returns", href: "/purchasing/returns", icon: Truck, permission: "purchasing.view", keywords: "debit note" },
      { title: "Suppliers", href: "/purchasing/suppliers", icon: Building2, permission: "parties.view", keywords: "vendors payable" },
    ],
  },
  {
    title: "Inventory & Warehouse",
    items: [
      { title: "Products", href: "/inventory/products", icon: Package, permission: "inventory.view", keywords: "items catalog sku" },
      { title: "Stock on Hand", href: "/inventory/stock", icon: Boxes, permission: "inventory.view", keywords: "quantity valuation" },
      { title: "Rolls & Batches", href: "/inventory/batches", icon: Layers, permission: "inventory.view", keywords: "thaan lot shade" },
      { title: "Stock Transfers", href: "/inventory/transfers", icon: ArrowLeftRight, permission: "inventory.view", keywords: "move branch" },
      { title: "Adjustments", href: "/inventory/adjustments", icon: SlidersHorizontal, permission: "inventory.view", keywords: "damage loss" },
      { title: "Stock Counts", href: "/inventory/counts", icon: ClipboardCheck, permission: "inventory.view", keywords: "physical stock take audit" },
      { title: "Stock Movements", href: "/inventory/movements", icon: History, permission: "inventory.view", keywords: "stock ledger card" },
      { title: "Warehouses", href: "/inventory/warehouses", icon: Warehouse, permission: "inventory.view", keywords: "branch shop location" },
      { title: "Categories & Units", href: "/inventory/setup", icon: ListTree, permission: "inventory.manage", keywords: "brand uom tax" },
    ],
  },
  {
    title: "Accounting",
    items: [
      { title: "Chart of Accounts", href: "/accounting/accounts", icon: ListTree, permission: "accounting.view", keywords: "coa" },
      { title: "Journal Entries", href: "/accounting/journals", icon: BookOpen, permission: "accounting.view", keywords: "jv voucher" },
      { title: "General Ledger", href: "/accounting/ledger", icon: ScrollText, permission: "accounting.view", keywords: "gl account statement" },
      { title: "Cash & Bank", href: "/accounting/banking", icon: Landmark, permission: "accounting.view", keywords: "cash book deposit transfer" },
      { title: "Petty Cash", href: "/accounting/petty-cash", icon: Coins, permission: ["accounting.pettycash", "accounting.view"], keywords: "imprest voucher" },
      { title: "Expenses", href: "/accounting/expenses", icon: Wallet, permission: ["accounting.expenses", "accounting.view"], keywords: "spending bills" },
      { title: "Financial Statements", href: "/accounting/statements", icon: LineChart, permission: "accounting.view", keywords: "trial balance profit loss balance sheet cash flow" },
    ],
  },
  {
    title: "HR & Payroll",
    items: [
      { title: "Employees", href: "/hr/employees", icon: UserCog, permission: "hr.view", keywords: "staff team" },
      { title: "Attendance", href: "/hr/attendance", icon: CalendarCheck, permission: ["hr.attendance", "hr.view"] },
      { title: "Leave", href: "/hr/leave", icon: Plane, permission: ["hr.attendance", "hr.view"], keywords: "holiday vacation" },
      { title: "Advances & Loans", href: "/hr/advances", icon: Receipt, permission: "hr.payroll", keywords: "salary advance loan" },
      { title: "Payroll", href: "/hr/payroll", icon: FileSpreadsheet, permission: "hr.payroll", keywords: "salary payslip" },
    ],
  },
  {
    title: "Administration",
    items: [
      { title: "Company Settings", href: "/settings/company", icon: Settings2, permission: "settings.company", keywords: "business profile numbering lock" },
      { title: "Users & Roles", href: "/settings/users", icon: ShieldCheck, permission: "settings.users", keywords: "permissions access" },
      { title: "Audit Log", href: "/settings/audit", icon: FileClock, permission: "settings.audit", keywords: "history changes" },
    ],
  },
];
