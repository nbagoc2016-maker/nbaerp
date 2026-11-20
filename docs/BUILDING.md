# Building modules in Shusui V4

Shusui V4 is a full ERP (a LabridTech product): Next.js 15 App Router, React 19, TypeScript,
Tailwind 4 + shadcn/ui, Drizzle ORM on PostgreSQL. Locally the database is **embedded Postgres
(PGlite)** stored in `.data/pglite`; nothing to install.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | App on http://localhost:3300 |
| `npm run db:reset` | Wipe local DB, apply schema, seed base + demo data |
| `npm test` | Core engine tests (in-memory DB) |
| `npx tsx scripts/test-<module>.ts` | A module's service tests (in-memory DB) |
| `npx tsc --noEmit --incremental false` | Type check |

Local login (dev only): see header of `scripts/seed.ts`.

> Only one process can open `.data/pglite` at a time (the dev server holds it). Tests use their
> own in-memory database via `scripts/test-utils.ts`, so they never touch `.data`.

## Layout

```
src/db/schema/*.ts          tables by domain (core, masters, accounting, inventory, sales, purchasing, hr)
src/server/services/*.ts    business logic. NO "server-only" import; take (db|tx, actor, input)
                            so scripts/tests can call them. Throw AppError for user-facing errors.
src/server/queries/*.ts     read queries for pages ("server-only" OK)
src/server/action.ts        action() wrapper for server actions (auth + permission + zod + tx + revalidate)
src/server/auth.ts          requireUser / requirePermission (pages), authorize (actions)
src/app/(app)/<module>/...  pages; actions.ts per module folder with "use server"
src/components/app/*        shared UI kit (below)
src/config/nav.ts           sidebar + routes for every module (already defined)
```

## Engines (use these, never write to these tables directly)

- **`postJournal(tx, actor, { date, memo, sourceType, sourceId, sourceNumber, lines })`** — balanced
  double entry. `lines[].account` takes an account id or code (`ACC.*` in `chart-of-accounts.ts`).
  Tag receivable/payable/advance lines with `partyType` + `partyId`, so customer, supplier and
  employee statements come straight from the GL (`partyBalance()`).
- **`voidJournal(tx, actor, entryId, reason)`** — journals are never deleted; voided ones drop out of reports.
- **`moveStock(tx, actor, { date, productId, warehouseId, qty (+in/−out), unitCost (receipts), batchId, sourceType, sourceId, sourceNumber })`**
  — the only way stock changes. Keeps `stock_balances` (qty + moving-average cost) and writes the
  immutable `stock_movements` ledger. Issues return the cost used: post COGS with it.
- `createBatch()` for rolls/lots of `trackBatches` products; `reverseStockForSource()` when voiding.
- **`nextNumber(tx, "SI")`** — document numbers (series in `numbering.ts`).
- **`logAudit(tx, actor, { action, entity, entityId, summary })`** — on every create/post/void/delete.
- `calcDocument()` in `src/lib/doc-calc.ts` — **always recompute totals on the server** with it.

### Posting rules (GL)

| Document | Debit | Credit |
|---|---|---|
| Sales invoice | Receivable (customer) total; COGS cost | Sales net-before-tax; Output tax; Inventory cost; (charges → Other Income 4300) |
| Customer receipt | Cash/Bank | Receivable (customer) |
| Sales return | Sales Returns 4200 net; Output tax; Inventory cost | Receivable (customer) or Cash/Bank refund; COGS cost |
| Goods receipt (GRN) | Inventory | GRNI 2150 |
| Supplier bill from GRN | GRNI (goods value); Input tax; Freight 5300 | Payable (supplier) |
| Direct bill (receives stock) | Inventory (stock lines); expense acct (service lines); Input tax | Payable (supplier) |
| Supplier payment | Payable (supplier) | Cash/Bank |
| Purchase return | Payable (supplier) | Inventory |
| Stock adjustment / count | Inventory (+) or 5200 (−) | 5200 (+) or Inventory (−) |
| Stock transfer | — (no GL; stock moves at cost) | — |
| Expense | Expense acct (+ Input tax) | Cash/Bank/Petty cash |
| Petty cash expense | Expense acct | Petty cash fund account |
| Petty cash top-up | Petty cash fund account | Cash/Bank |
| Bank transfer | To account | From account |
| Employee advance | Employee Advances 1500 (employee) | Cash/Bank |
| Payroll posted | Salaries 6100 gross | Salaries Payable 2300 (employee) net; Employee Advances 1500 (employee) recovered |
| Salary payment | Salaries Payable (employee) | Cash/Bank |
| Customer/supplier opening balance | Receivable / Opening Balance Equity 3300 | Opening Balance Equity / Payable |

Customer walk-in sales (no customer) still go through Receivable with no party and are settled
by the POS receipt in the same transaction.

## Server action pattern

```ts
// src/app/(app)/sales/invoices/actions.ts
"use server";
import { z } from "zod";
import { action } from "@/server/action";
import { createInvoice } from "@/server/services/sales";

export const saveInvoice = action(
  { permission: "sales.create", schema: invoiceSchema, revalidate: ["/sales/invoices"] },
  async (input, { tx, actor }) => createInvoice(tx, actor, input)  // returns { id }
);
```

Client side: `const { run, pending } = useAction(); run(() => saveInvoice(payload), { success: "Saved", redirectTo: (d) => \`/sales/invoices/${d.id}\` })`.
Destructive/irreversible steps (post, void, delete) use `<ConfirmButton>`.

## Page pattern

```tsx
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requirePermission("sales.view");
  const { id } = await params;          // params/searchParams are Promises in Next 15
  ...
  return (<>
    <PageHeader title="Invoices" description="…" actions={<Button asChild><Link href="/sales/invoices/new">New invoice</Link></Button>} />
    <InvoicesTable data={rows} />       // client component wrapping <DataTable>
  </>);
}
```

Column definitions contain functions, so every table is a small `"use client"` component that
defines `ColumnDef[]` and renders `<DataTable>`. Use `meta: { align: "right" }` for numbers.

## UI kit (`src/components/app`)

`PageHeader` · `StatCard` · `StatusBadge` · `Money` · `EmptyState` · `DataTable` (search, sort,
paging, CSV export, row links) · `Combobox` · `LineItemsEditor` + `toLinePayload` (validate with
`zDocLines` from `src/lib/schemas.ts`) · `PrintDocument` + `PrintButton` · `PeriodFilter`
(+ `readPeriod` from `src/lib/period.ts`) · `ConfirmButton` · `useAction`.
Lookups for pickers: `src/server/queries/options.ts`. Company profile: `getCompany()`.
shadcn primitives live in `src/components/ui`.

## Design language

- Every page starts with `PageHeader` (title, one-line description, primary action on the right).
  Detail pages pass `backHref` and a `StatusBadge` as `badge`.
- List pages: optional row of 3–4 `StatCard`s, then the `DataTable`. Empty states explain what
  the screen is for and offer the create action.
- Forms: `Card`s with clear section titles, a 2–3 column responsive grid of `Label` + input,
  field errors under inputs, sticky-feeling action bar at the bottom (Cancel / Save draft / Save & post).
- Numbers right-aligned with `tabular`; money via `Money`/`formatMoney`; dates via `formatDate`;
  quantities via `formatQty`. Business dates are `YYYY-MM-DD` strings (`today()`), never `toISOString()`.
- Colours only from theme tokens (`text-success`, `bg-warning/15`, `text-destructive`, `text-primary`…)
  so light and dark mode both work. No hard-coded hex or Tailwind palette colours.
- Responsive: usable at 375px wide; tables scroll horizontally inside their card.
- Wording is plain business English ("Post invoice", "Record payment"), no jargon in labels.

## Rules

- Permissions: pages `requirePermission(...)`; actions via `action({ permission })`. Keys in `src/lib/permissions.ts`.
- Every write happens inside the action's transaction (`tx`), including GL and stock postings, so a
  document and its postings commit together.
- Posted documents are immutable: edit only drafts; correct posted ones by voiding (reverse stock +
  `voidJournal`) or with a return/credit document.
- Respect the lock date (postJournal enforces it).
