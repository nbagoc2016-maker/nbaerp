// Permission catalog. Shared by server (enforcement) and client (hiding UI the user can't use).
// Keys are "<module>.<action>". A role holding "*" can do everything.

export const PERMISSION_GROUPS = [
  {
    module: "dashboard",
    label: "Dashboard",
    permissions: [{ key: "dashboard.view", label: "View dashboard & KPIs" }],
  },
  {
    module: "sales",
    label: "Sales",
    permissions: [
      { key: "sales.view", label: "View sales documents" },
      { key: "sales.pos", label: "Use POS" },
      { key: "sales.create", label: "Create & edit quotations, orders, invoices" },
      { key: "sales.post", label: "Post invoices & returns" },
      { key: "sales.void", label: "Void sales documents" },
      { key: "sales.discount", label: "Give discounts below minimum price" },
      { key: "sales.receipts", label: "Record customer receipts" },
    ],
  },
  {
    module: "purchasing",
    label: "Purchasing",
    permissions: [
      { key: "purchasing.view", label: "View purchase documents" },
      { key: "purchasing.create", label: "Create & edit purchase orders, GRNs, bills" },
      { key: "purchasing.approve", label: "Approve purchase orders" },
      { key: "purchasing.post", label: "Post GRNs, bills & returns" },
      { key: "purchasing.void", label: "Void purchase documents" },
      { key: "purchasing.payments", label: "Record supplier payments" },
    ],
  },
  {
    module: "inventory",
    label: "Inventory & Warehouse",
    permissions: [
      { key: "inventory.view", label: "View products & stock" },
      { key: "inventory.manage", label: "Create & edit products, categories, units" },
      { key: "inventory.cost", label: "See cost prices & stock value" },
      { key: "inventory.transfer", label: "Transfer stock between warehouses" },
      { key: "inventory.adjust", label: "Adjust stock & post stock counts" },
      { key: "inventory.warehouses", label: "Manage warehouses & locations" },
    ],
  },
  {
    module: "production",
    label: "Production / Manufacturing",
    permissions: [
      { key: "production.view", label: "View bill of materials & work orders" },
      { key: "production.manage", label: "Create & edit BOMs and work orders" },
      { key: "production.complete", label: "Complete work orders and post finished goods" },
      { key: "production.cancel", label: "Cancel work orders" },
    ],
  },
  {
    module: "parties",
    label: "Customers & Suppliers",
    permissions: [
      { key: "parties.view", label: "View customers & suppliers" },
      { key: "parties.manage", label: "Create & edit customers & suppliers" },
    ],
  },
  {
    module: "accounting",
    label: "Accounting & Finance",
    permissions: [
      { key: "accounting.view", label: "View ledgers & financial reports" },
      { key: "accounting.journal", label: "Post manual journal entries" },
      { key: "accounting.accounts", label: "Manage chart of accounts" },
      { key: "accounting.banking", label: "Cash & bank transfers" },
      { key: "accounting.expenses", label: "Record expenses" },
      { key: "accounting.pettycash", label: "Petty cash vouchers" },
      { key: "accounting.close", label: "Close periods (lock date)" },
    ],
  },
  {
    module: "hr",
    label: "HR & Payroll",
    permissions: [
      { key: "hr.view", label: "View employees" },
      { key: "hr.manage", label: "Manage employees, departments, leave types" },
      { key: "hr.attendance", label: "Mark attendance & approve leave" },
      { key: "hr.payroll", label: "Run payroll, advances & salary payments" },
    ],
  },
  {
    module: "reports",
    label: "Reports",
    permissions: [{ key: "reports.view", label: "View business reports" }],
  },
  {
    module: "settings",
    label: "Administration",
    permissions: [
      { key: "settings.company", label: "Company settings & numbering" },
      { key: "settings.users", label: "Manage users & roles" },
      { key: "settings.audit", label: "View audit log" },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

export function hasPermission(granted: readonly string[], permission: Permission | Permission[]): boolean {
  if (granted.includes("*")) return true;
  const needed = Array.isArray(permission) ? permission : [permission];
  return needed.some((p) => granted.includes(p));
}

// Starting roles created by the seed. Admins can edit them or add more.
export const DEFAULT_ROLES: { name: string; description: string; permissions: string[] }[] = [
  { name: "Administrator", description: "Full access to everything", permissions: ["*"] },
  {
    name: "Manager",
    description: "Runs the business day to day; no user administration",
    permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith("settings.") && p !== "accounting.close"),
  },
  {
    name: "Accountant",
    description: "Books, banking, expenses, payroll and reports",
    permissions: [
      "dashboard.view",
      "sales.view",
      "sales.receipts",
      "purchasing.view",
      "purchasing.payments",
      "inventory.view",
      "inventory.cost",
      "parties.view",
      "parties.manage",
      "accounting.view",
      "accounting.journal",
      "accounting.accounts",
      "accounting.banking",
      "accounting.expenses",
      "accounting.pettycash",
      "accounting.close",
      "hr.view",
      "hr.payroll",
      "reports.view",
    ],
  },
  {
    name: "Cashier",
    description: "POS and customer receipts",
    permissions: ["sales.view", "sales.pos", "sales.create", "sales.post", "sales.receipts", "inventory.view", "parties.view", "parties.manage"],
  },
  {
    name: "Storekeeper",
    description: "Receiving, transfers and stock counts",
    permissions: [
      "inventory.view",
      "inventory.manage",
      "inventory.transfer",
      "inventory.adjust",
      "inventory.warehouses",
      "purchasing.view",
      "purchasing.create",
      "purchasing.post",
      "parties.view",
    ],
  },
  {
    name: "HR Officer",
    description: "Employees, attendance and leave",
    permissions: ["hr.view", "hr.manage", "hr.attendance"],
  },
];
