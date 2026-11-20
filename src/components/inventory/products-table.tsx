"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatQty } from "@/lib/format";
import { FilterSelect, FilterSwitch } from "./url-filters";
import { ProductAvatar, StockBadge, stockState } from "./shared";

export interface ProductListRow {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  imageUrl: string | null;
  type: "stock" | "service";
  categoryId: string | null;
  category: string | null;
  brandId: string | null;
  brand: string | null;
  unit: string;
  salePrice: number;
  reorderLevel: number;
  trackBatches: boolean;
  isActive: boolean;
  onHand: number;
  value: number | null; // null when the user can't see costs
}

export function ProductsTable({
  data,
  canCost,
  canManage,
  categories,
  brands,
}: {
  data: ProductListRow[];
  canCost: boolean;
  canManage: boolean;
  categories: { value: string; label: string }[];
  brands: { value: string; label: string }[];
}) {
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("active");
  const [lowOnly, setLowOnly] = useState(false);

  const rows = useMemo(
    () =>
      data.filter(
        (r) =>
          (!category || r.categoryId === category) &&
          (!brand || r.brandId === brand) &&
          (status === "" || (status === "active" ? r.isActive : !r.isActive)) &&
          (!lowOnly || (r.type === "stock" && stockState(r.onHand, r.reorderLevel) !== "in"))
      ),
    [data, category, brand, status, lowOnly]
  );

  const columns = useMemo<ColumnDef<ProductListRow, unknown>[]>(() => {
    const cols: ColumnDef<ProductListRow, unknown>[] = [
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => (
          <div className="flex min-w-56 items-center gap-3">
            <ProductAvatar name={row.original.name} imageUrl={row.original.imageUrl} />
            <div className="min-w-0">
              <Link href={`/inventory/products/${row.original.id}`} className="block truncate font-medium hover:underline">
                {row.original.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {row.original.sku}
                {row.original.barcode ? ` · ${row.original.barcode}` : ""}
              </span>
            </div>
          </div>
        ),
        meta: { csv: (r: unknown) => (r as ProductListRow).name },
      },
      { accessorKey: "sku", header: "SKU", cell: ({ getValue }) => <span className="tabular text-muted-foreground">{getValue() as string}</span> },
      { accessorKey: "category", header: "Category", cell: ({ getValue }) => (getValue() as string) ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: "brand", header: "Brand", cell: ({ getValue }) => (getValue() as string) ?? <span className="text-muted-foreground">—</span> },
      { accessorKey: "unit", header: "Unit" },
      {
        accessorKey: "onHand",
        header: "On hand",
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.type === "service" ? <span className="text-muted-foreground">Service</span> : <span className="font-medium">{formatQty(row.original.onHand)}</span>,
      },
    ];
    if (canCost) {
      cols.push({ accessorKey: "value", header: "Stock value", meta: { align: "right" }, cell: ({ getValue }) => <Money value={getValue() as number} muteZero /> });
    }
    cols.push(
      { accessorKey: "salePrice", header: "Sale price", meta: { align: "right" }, cell: ({ getValue }) => <Money value={getValue() as number} /> },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => (r.isActive ? (r.type === "stock" ? stockState(r.onHand, r.reorderLevel) : "service") : "inactive"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {!row.original.isActive && <StatusBadge status="inactive" />}
            {row.original.type === "stock" ? <StockBadge qty={row.original.onHand} reorderLevel={row.original.reorderLevel} /> : <StatusBadge status="draft">Service</StatusBadge>}
          </div>
        ),
      }
    );
    return cols;
  }, [canCost]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="products"
      searchPlaceholder="Search name, SKU, barcode…"
      rowHref={(r) => `/inventory/products/${r.id}`}
      emptyTitle={data.length ? "No products match these filters" : "No products yet"}
      emptyDescription={data.length ? "Change or clear the filters above." : "Add the items you buy and sell to track stock, costs and prices."}
      emptyAction={
        canManage && !data.length ? (
          <Button asChild size="sm">
            <Link href="/inventory/products/new">
              <Plus className="size-4" />
              New product
            </Link>
          </Button>
        ) : undefined
      }
      toolbar={
        <>
          <FilterSelect value={category} onChange={setCategory} options={categories} allLabel="All categories" />
          <FilterSelect value={brand} onChange={setBrand} options={brands} allLabel="All brands" className="w-36" />
          <FilterSelect
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            allLabel="Any status"
            className="w-32"
          />
          <FilterSwitch id="low-only" checked={lowOnly} onChange={setLowOnly} label="Low / out only" />
        </>
      }
    />
  );
}
