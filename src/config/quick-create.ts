import { BookOpen, ClipboardList, Coins, FileText, HandCoins, type LucideIcon, Package, ReceiptText, ShoppingCart, Store, UserPlus, Wallet } from "lucide-react";
import type { Permission } from "@/lib/permissions";

// "New …" shortcuts shown in the top bar menu and the command search. Each href opens a create page.
export const QUICK_CREATE: { title: string; href: string; icon: LucideIcon; permission?: Permission | Permission[] }[] = [
  { title: "POS Sale", href: "/sales/pos", icon: Store, permission: "sales.pos" },
  { title: "Invoice", href: "/sales/invoices/new", icon: ReceiptText, permission: "sales.create" },
  { title: "Quotation", href: "/sales/quotations/new", icon: FileText, permission: "sales.create" },
  { title: "Sales Order", href: "/sales/orders/new", icon: ClipboardList, permission: "sales.create" },
  { title: "Customer Receipt", href: "/sales/receipts/new", icon: HandCoins, permission: "sales.receipts" },
  { title: "Purchase Order", href: "/purchasing/orders/new", icon: ShoppingCart, permission: "purchasing.create" },
  { title: "Product", href: "/inventory/products/new", icon: Package, permission: "inventory.manage" },
  { title: "Expense", href: "/accounting/expenses/new", icon: Wallet, permission: "accounting.expenses" },
  { title: "Petty Cash Voucher", href: "/accounting/petty-cash/new", icon: Coins, permission: "accounting.pettycash" },
  { title: "Journal Entry", href: "/accounting/journals/new", icon: BookOpen, permission: "accounting.journal" },
  { title: "Employee", href: "/hr/employees/new", icon: UserPlus, permission: "hr.manage" },
];
