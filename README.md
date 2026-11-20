# Shusui V4

**A complete ERP for retail and wholesale businesses — a LabridTech product.**

Sales and POS, purchasing, multi-warehouse inventory with roll/batch tracking, double-entry
accounting with a General Ledger, cash & bank, petty cash, HR & payroll, a live dashboard and
16 business reports — all posting into one set of books.

## Modules

| Area | What's in it |
|---|---|
| **Sales** | Point of Sale (barcode, fractional qty, split payments, 80 mm receipts, hold/recall), quotations → sales orders → invoices, customer receipts with allocation, returns & refunds, customers with statements |
| **Purchasing** | Purchase orders with approval, goods receipts with roll/lot entry, supplier bills (from GRN, PO or direct), supplier payments with allocation, purchase returns, suppliers with statements |
| **Inventory & Warehouse** | Products (pricing, margins, barcodes, CSV import), stock on hand by warehouse with valuation, rolls & batches, transfers, adjustments, stock counts, stock movement ledger, warehouses & bin locations, categories / brands / units / taxes |
| **Accounting** | Chart of accounts, manual journals, General Ledger, cash & bank registers and transfers, petty cash funds and vouchers, expenses, Trial Balance, Profit & Loss, Balance Sheet, Cash Flow, closing the books |
| **HR & Payroll** | Employees, daily attendance & monthly grid, leave with balances, advances & loans, monthly payroll with payslips and salary payments, employee ledger |
| **Insights & Admin** | Dashboard (KPIs, charts, alerts), 16 reports with CSV export and print, company settings, document numbering, users, roles & permissions, audit log |

Every document posts automatically into the General Ledger (see `docs/BUILDING.md` for the
posting rules). Stock uses moving-average cost per warehouse.

## Tech

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Drizzle ORM ·
PostgreSQL (embedded PGlite for local development) · server-side sessions and role-based permissions.

## Run locally

```bash
npm install
npm run db:reset   # creates the local database and loads demo data
npm run dev        # http://localhost:3300
```

The demo login is in the header comment of `scripts/seed.ts` (local development only — change
it in Settings → Users before any real use).

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Develop, build, run in production mode |
| `npm run db:reset` | Wipe and rebuild the local database with demo data |
| `npm run db:push` | Apply schema changes to the local database |
| `npm test` and `npx tsx scripts/test-<module>.ts` | Engine and module tests (in-memory database) |

Module tests: `engines`, `sales`, `purchasing`, `inventory`, `accounting`, `hr`, `admin`.

## Hosted demo (Vercel + Neon)

When `DATABASE_URL` is set the app connects to hosted Postgres (Neon, pooled over WebSockets)
instead of the embedded database. The demo runs on Vercel (functions in `fra1`, see `vercel.json`)
with a Neon database from the Vercel Marketplace; pushes to `main` redeploy it.

To rebuild the demo database, pull its env vars into a file Next.js won't load in local dev and
run the schema push and seed against it:

```bash
vercel env pull .env.demo --yes
set -a && . ./.env.demo && set +a && npx drizzle-kit push --force && npx tsx scripts/seed.ts --demo
```

## Project layout

See [`docs/BUILDING.md`](docs/BUILDING.md) for architecture, conventions, the posting rules and
the UI kit.

© LabridTech
