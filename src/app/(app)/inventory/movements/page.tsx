import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { MovementsTable } from "@/components/inventory/movements-table";
import { SOURCE_LABELS } from "@/components/inventory/source-links";
import { UrlCombobox, UrlSelect } from "@/components/inventory/url-filters";
import { STOCK_SOURCES } from "@/db/schema";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { activeWarehouses, productPickList, stockLedger } from "@/server/queries/inventory";
import type { StockSource } from "@/server/services/stock";

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; product?: string; warehouse?: string; source?: string }>;
}) {
  const user = await requirePermission("inventory.view");
  const sp = await searchParams;
  const canCost = can(user, "inventory.cost");
  const { from, to } = readPeriod(sp);
  const sourceType = (STOCK_SOURCES as readonly string[]).includes(sp.source ?? "") ? (sp.source as StockSource) : null;
  const [company, products, warehouses] = await Promise.all([getCompany(), productPickList(), activeWarehouses()]);
  const productId = products.some((p) => p.id === sp.product) ? sp.product! : null;
  const warehouseId = warehouses.some((w) => w.id === sp.warehouse) ? sp.warehouse! : null;
  const ledger = await stockLedger({ from, to, productId, warehouseId, sourceType });

  const product = productId ? products.find((p) => p.id === productId) : null;
  const runningLabel = productId ? (warehouseId ? "Balance" : "Balance (all wh.)") : "Wh. balance";

  return (
    <>
      <PageHeader
        title="Stock movements"
        description={product ? `Stock ledger for ${product.name} (${product.sku}).` : "The stock ledger: every quantity in and out, with its source document."}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PeriodFilter from={from} to={to} fiscalStartMonth={company.fiscalYearStartMonth ?? 7} />
        <UrlCombobox name="product" value={productId} placeholder="All products" options={products.map((p) => ({ value: p.id, label: p.name, hint: p.sku, keywords: p.barcode ?? "" }))} />
        <UrlSelect name="warehouse" value={warehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} allLabel="All warehouses" />
        <UrlSelect name="source" value={sourceType} options={STOCK_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s }))} allLabel="All sources" />
      </div>
      {ledger.truncated && (
        <p className="mb-3 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground dark:text-warning">
          Showing the first {ledger.limit.toLocaleString()} movements. Narrow the period or pick a product to see the rest.
        </p>
      )}
      <MovementsTable
        canCost={canCost}
        runningLabel={runningLabel}
        opening={productId ? { qty: ledger.opening.qty, value: canCost ? ledger.opening.value : null } : null}
        rows={ledger.rows.map((r) => ({
          id: r.id,
          date: r.date,
          productId: r.productId,
          product: r.product,
          sku: r.sku,
          unit: r.unit,
          warehouse: r.warehouse,
          batchNo: r.batchNo,
          qty: r.qty,
          unitCost: canCost ? r.unitCost : null,
          value: canCost ? r.value : null,
          running: r.running,
          sourceType: r.sourceType,
          kind: r.kind,
          sourceId: r.sourceId,
          sourceNumber: r.sourceNumber,
          notes: r.notes,
          user: r.user,
        }))}
      />
    </>
  );
}
