"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Banknote,
  Keyboard,
  LayoutGrid,
  List,
  Minus,
  PackageSearch,
  Plus,
  Printer,
  ReceiptText,
  ScanBarcode,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  UserPlus,
  Warehouse,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { completePosSaleAction } from "@/app/(app)/sales/pos/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcDocument } from "@/lib/doc-calc";
import { formatDateTime, formatMoney, formatQty, round2, round3 } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PosProduct } from "@/server/queries/sales-pos";
import { WALK_IN } from "@/server/services/sales-schemas";
import { PaymentDialog, type PaymentAccount, type PosPayment } from "./payment-dialog";
import { QuickCustomerDialog, type NewCustomer } from "./quick-customer-dialog";
import { ThermalReceipt, type ThermalReceiptData } from "./thermal-receipt";

type PriceLevel = "retail" | "wholesale";
export type PosCustomer = ComboOption & { priceLevel: PriceLevel; phone: string | null };

interface CartLine {
  key: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  allowFraction: boolean;
  type: "stock" | "service";
  qty: number;
  price: number;
  priceEdited: boolean;
  discountPct: number;
  taxRate: number;
}

interface HeldCart {
  id: string;
  at: number;
  customerId: string | null;
  walkInName: string;
  lines: CartLine[];
  billDiscount: number;
  discountMode: "amount" | "percent";
}

const HELD_KEY = "shusui.pos.held.v1";
const WH_KEY = "shusui.pos.warehouse";
const VIEW_KEY = "shusui.pos.view";

const readHeld = (): HeldCart[] => {
  try {
    return JSON.parse(localStorage.getItem(HELD_KEY) ?? "[]") as HeldCart[];
  } catch {
    return [];
  }
};
const writeHeld = (h: HeldCart[]) => {
  try {
    localStorage.setItem(HELD_KEY, JSON.stringify(h));
  } catch {
    /* storage unavailable: holding still works for this session */
  }
};

const priceFor = (p: PosProduct, level: PriceLevel) => (level === "wholesale" && p.wholesalePrice ? p.wholesalePrice : p.price);
const floorFor = (p: PosProduct, level: PriceLevel) => (level === "wholesale" && p.wholesalePrice ? Math.min(p.minPrice, p.wholesalePrice) : p.minPrice);

export function PosTerminal({
  products,
  categories,
  warehouses,
  defaultWarehouseId,
  customers: initialCustomers,
  accounts,
  company,
  cashier,
  canDiscount,
  canAddCustomer,
}: {
  products: PosProduct[];
  categories: { id: string; name: string }[];
  warehouses: { id: string; name: string; code: string; type: string }[];
  defaultWarehouseId: string | null;
  customers: PosCustomer[];
  accounts: PaymentAccount[];
  company: ThermalReceiptData["company"];
  cashier: string;
  canDiscount: boolean;
  canAddCustomer: boolean;
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [warehouseId, setWarehouseId] = useState<string | null>(defaultWarehouseId);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [billDiscount, setBillDiscount] = useState(0);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payKey, setPayKey] = useState(0);
  const [receipt, setReceipt] = useState<(ThermalReceiptData & { invoiceId: string; warning?: string | null }) | null>(null);
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [quickAdd, setQuickAdd] = useState(false);
  const [mobileView, setMobileView] = useState<"products" | "cart">("products");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [now, setNow] = useState<Date | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { run, pending } = useAction();

  // Restore held carts, the last warehouse and the product view used on this device
  useEffect(() => {
    setHeld(readHeld());
    try {
      const w = localStorage.getItem(WH_KEY);
      if (w && warehouses.some((x) => x.id === w)) setWarehouseId(w);
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "list") setView(v);
    } catch {
      /* ignore */
    }
  }, [warehouses]);

  // Register clock (client only, so server and client render the same markup)
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const pickView = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const customer = customers.find((c) => c.value === customerId) ?? null;
  const level: PriceLevel = customer?.priceLevel ?? "retail";
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouse = warehouses.find((w) => w.id === warehouseId);
  const onHand = useCallback((p: PosProduct) => (warehouseId ? (p.stock[warehouseId] ?? 0) : 0), [warehouseId]);
  const inCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.productId, round3((m.get(l.productId) ?? 0) + l.qty));
    return m;
  }, [cart]);

  // ---- Totals -----------------------------------------------------------------------------------
  const calcLines = cart.map((l) => ({ qty: l.qty, price: l.price, discountPct: l.discountPct, taxRate: l.taxRate }));
  const base = calcDocument(calcLines);
  const docDiscount = discountMode === "percent" ? round2((base.netBeforeTax * Math.min(billDiscount, 100)) / 100) : Math.min(billDiscount, base.netBeforeTax);
  const totals = calcDocument(calcLines, { documentDiscount: docDiscount });
  const itemCount = cart.reduce((s, l) => s + (l.allowFraction ? 1 : l.qty), 0);

  const issues = cart.map((l) => {
    const p = byId.get(l.productId);
    if (!p) return { belowMin: false, short: false, floor: 0, available: 0 };
    const floor = floorFor(p, level);
    const effective = l.price * (1 - l.discountPct / 100);
    const available = onHand(p);
    return { belowMin: floor > 0 && effective < floor - 0.005, short: p.type === "stock" && (inCart.get(p.id) ?? 0) > available + 0.0005, floor, available };
  });
  const blocked = issues.some((i) => i.short || (i.belowMin && !canDiscount));

  // ---- Cart operations --------------------------------------------------------------------------
  const add = useCallback(
    (p: PosProduct, qty = 1) => {
      if (!warehouseId) {
        toast.error("Pick the warehouse you're selling from");
        return;
      }
      if (p.type === "stock") {
        const available = onHand(p);
        const already = inCart.get(p.id) ?? 0;
        if (already + qty > available + 0.0005) {
          toast.error(`Only ${formatQty(available)} ${p.unit} of "${p.name}" in ${warehouse?.name ?? "this warehouse"}`);
          return;
        }
      }
      const q = p.allowFraction ? round3(qty) : Math.max(1, Math.round(qty));
      setCart((c) => {
        const ex = c.find((l) => l.productId === p.id && !l.priceEdited && l.discountPct === 0);
        if (ex) return c.map((l) => (l.key === ex.key ? { ...l, qty: round3(l.qty + q) } : l));
        return [
          ...c,
          {
            key: crypto.randomUUID(),
            productId: p.id,
            name: p.name,
            sku: p.sku,
            unit: p.unit,
            allowFraction: p.allowFraction,
            type: p.type,
            qty: q,
            price: priceFor(p, level),
            priceEdited: false,
            discountPct: 0,
            taxRate: p.taxRate,
          },
        ];
      });
      setFlash(p.id);
      setTimeout(() => setFlash((f) => (f === p.id ? null : f)), 450);
    },
    [inCart, level, onHand, warehouse?.name, warehouseId]
  );

  const update = (key: string, patch: Partial<CartLine>) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setCart((c) => c.filter((l) => l.key !== key));
  const step = (l: CartLine, dir: 1 | -1) => {
    const inc = l.allowFraction ? 0.5 : 1;
    const next = round3(l.qty + dir * inc);
    if (next <= 0) remove(l.key);
    else update(l.key, { qty: next });
  };

  const clearSale = () => {
    setCart([]);
    setCustomerId(null);
    setWalkInName("");
    setWalkInPhone("");
    setBillDiscount(0);
    setDiscountMode("amount");
    setQuery("");
  };

  // Changing customer re-prices lines whose price wasn't typed in by hand
  const pickCustomer = (v: string | null) => {
    const id = v && v !== WALK_IN ? v : null;
    setCustomerId(id);
    const lvl = customers.find((c) => c.value === id)?.priceLevel ?? "retail";
    setCart((c) =>
      c.map((l) => {
        const p = byId.get(l.productId);
        return p && !l.priceEdited ? { ...l, price: priceFor(p, lvl) } : l;
      })
    );
  };

  const pickWarehouse = (w: string) => {
    setWarehouseId(w);
    try {
      localStorage.setItem(WH_KEY, w);
    } catch {
      /* ignore */
    }
  };

  // ---- Search & scan ----------------------------------------------------------------------------
  const parsed = useMemo(() => {
    const m = query.trim().match(/^(\d+(?:\.\d+)?)\s*[*x]\s*(.+)$/i);
    return m ? { qty: Number(m[1]), text: m[2].trim() } : { qty: 1, text: query.trim() };
  }, [query]);

  const filtered = useMemo(() => {
    const words = parsed.text.toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      if (category && p.categoryId !== category) return false;
      if (!words.length) return true;
      const hay = `${p.name} ${p.sku} ${p.barcode ?? ""} ${p.color ?? ""} ${p.size ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [products, category, parsed.text]);

  const submitSearch = () => {
    const code = parsed.text.toLowerCase();
    if (!code) return;
    const exact = products.find((p) => p.barcode?.toLowerCase() === code || p.sku.toLowerCase() === code);
    const target = exact ?? (filtered.length ? filtered[0] : undefined);
    if (!target) {
      toast.error(`No product matches "${parsed.text}"`);
      searchRef.current?.select();
      return;
    }
    add(target, parsed.qty);
    setQuery("");
  };

  // ---- Hold / recall ----------------------------------------------------------------------------
  const holdCart = useCallback(() => {
    if (!cart.length) return;
    const h: HeldCart = { id: crypto.randomUUID(), at: Date.now(), customerId, walkInName, lines: cart, billDiscount, discountMode };
    const next = [h, ...readHeld()].slice(0, 20);
    writeHeld(next);
    setHeld(next);
    clearSale();
    toast.success("Sale put on hold");
    searchRef.current?.focus();
  }, [cart, customerId, walkInName, billDiscount, discountMode]);

  const recall = (h: HeldCart) => {
    let next = readHeld().filter((x) => x.id !== h.id);
    if (cart.length) {
      next = [{ id: crypto.randomUUID(), at: Date.now(), customerId, walkInName, lines: cart, billDiscount, discountMode }, ...next];
      toast.message("Current sale put on hold");
    }
    writeHeld(next);
    setHeld(next);
    setCart(h.lines);
    setCustomerId(h.customerId && customers.some((c) => c.value === h.customerId) ? h.customerId : null);
    setWalkInName(h.walkInName);
    setBillDiscount(h.billDiscount);
    setDiscountMode(h.discountMode);
  };
  const dropHeld = (id: string) => {
    const next = readHeld().filter((x) => x.id !== id);
    writeHeld(next);
    setHeld(next);
  };

  // ---- Checkout ---------------------------------------------------------------------------------
  const openPayment = useCallback(() => {
    if (!cart.length) {
      toast.error("The cart is empty");
      return;
    }
    if (blocked) {
      toast.error("Fix the highlighted lines first");
      return;
    }
    setPayKey((k) => k + 1);
    setPayOpen(true);
  }, [cart.length, blocked]);

  const complete = (payments: PosPayment[], tendered: number) => {
    if (!warehouseId) return;
    const snapshot = { lines: cart, totals, customerName: customer?.label ?? (walkInName.trim() || "Walk-in customer"), phone: customer?.phone ?? walkInPhone };
    run(
      () =>
        completePosSaleAction({
          customerId,
          customerName: customerId ? null : walkInName,
          customerPhone: customerId ? null : walkInPhone,
          warehouseId,
          lines: cart.map((l) => ({ productId: l.productId, description: l.name, qty: l.qty, price: l.price, discountPct: l.discountPct, taxRate: l.taxRate })),
          documentDiscount: totals.documentDiscount,
          payments,
          tendered,
          notes: null,
        }),
      {
        success: (d) => `Sale ${d.number} completed`,
        onSuccess: (d) => {
          setPayOpen(false);
          setReceipt({
            invoiceId: d.invoiceId,
            warning: d.warning,
            company,
            number: d.number,
            at: new Date(),
            cashier,
            customerName: snapshot.customerName,
            customerPhone: snapshot.phone || null,
            warehouse: warehouse?.name,
            lines: snapshot.lines.map((l, i) => ({
              name: l.name,
              sku: l.sku,
              qty: l.qty,
              unit: l.unit,
              price: l.price,
              discountPct: l.discountPct,
              amount: round2(snapshot.totals.lines[i].gross - snapshot.totals.lines[i].discountAmount),
            })),
            subtotal: round2(snapshot.totals.subtotal - snapshot.totals.lineDiscounts),
            discount: snapshot.totals.documentDiscount,
            tax: snapshot.totals.taxTotal,
            total: d.total,
            payments: d.receipts.map((r) => ({ method: r.method, amount: r.amount, reference: payments.find((p) => p.method === r.method)?.reference ?? null })),
            tendered,
            change: d.change,
            balanceDue: d.balanceDue,
          });
          if (d.warning) toast.warning(d.warning, { duration: 8000 });
          clearSale();
        },
      }
    );
  };

  const newSale = () => {
    setReceipt(null);
    setMobileView("products");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  // ---- Keyboard shortcuts -----------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (payOpen || receipt || quickAdd) return;
      if (e.key === "F2") {
        e.preventDefault();
        setMobileView("products");
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        document.getElementById("pos-customer")?.click();
      } else if (e.key === "F8") {
        e.preventDefault();
        holdCart();
      } else if (e.key === "F9" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        openPayment();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payOpen, receipt, quickAdd, holdCart, openPayment]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const customerOptions = useMemo<ComboOption[]>(
    () => [{ value: WALK_IN, label: "Walk-in customer", hint: "Cash sale", keywords: "cash counter" }, ...customers],
    [customers]
  );

  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) if (p.categoryId) m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1);
    return m;
  }, [products]);
  // Each category gets a chart colour so tiles are easy to tell apart at a glance
  const tone = useMemo(() => new Map(categories.map((c, i) => [c.id, `var(--chart-${(i % 5) + 1})`])), [categories]);

  const stockState = (p: PosProduct) => {
    const left = round3(onHand(p) - (inCart.get(p.id) ?? 0));
    const out = p.type === "stock" && left <= 0;
    const low = p.type === "stock" && !out && left <= (p.allowFraction ? 10 : 3);
    return { left, out, low };
  };

  const shown = filtered.slice(0, 240);
  const blockedLine = (i: number) => issues[i].short || (issues[i].belowMin && !canDiscount);

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100svh-6rem)]">
      {/* ---------------- Register bar ---------------- */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-card px-3 py-2 shadow-xs">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Store className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold leading-tight">Point of Sale</h1>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-success" />
                Register open
              </span>
              <span aria-hidden>·</span>
              <span className="truncate">{cashier}</span>
              {now && (
                <>
                  <span aria-hidden className="hidden sm:inline">
                    ·
                  </span>
                  <span className="hidden tabular sm:inline">{formatDateTime(now)}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Select value={warehouseId ?? undefined} onValueChange={pickWarehouse}>
            <SelectTrigger size="sm" className="w-40 sm:w-44" aria-label="Selling from warehouse">
              <Warehouse className="size-4 text-muted-foreground" />
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={!held.length}>
                <ArchiveRestore className="size-4" />
                <span className="hidden sm:inline">Held sales</span>
                {held.length > 0 && <Badge className="h-5 min-w-5 rounded-full px-1.5 tabular">{held.length}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-2">
              <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sales on hold</p>
              <div className="max-h-80 space-y-1 overflow-auto">
                {held.map((h) => {
                  const t = calcDocument(h.lines.map((l) => ({ qty: l.qty, price: l.price, discountPct: l.discountPct, taxRate: l.taxRate })));
                  const who = customers.find((c) => c.value === h.customerId)?.label ?? (h.walkInName || "Walk-in");
                  return (
                    <div key={h.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => recall(h)}>
                        <p className="truncate text-sm font-medium">{who}</p>
                        <p className="text-xs text-muted-foreground">
                          {h.lines.length} item{h.lines.length === 1 ? "" : "s"} · {formatMoney(t.total)} · {formatDateTime(new Date(h.at))}
                        </p>
                      </button>
                      <Button variant="ghost" size="icon-sm" aria-label="Discard held sale" onClick={() => dropHeld(h.id)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts" className="hidden sm:inline-flex">
                <Keyboard className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 text-sm">
              <p className="mb-2 font-medium">Keyboard shortcuts</p>
              <ul className="space-y-1.5 text-muted-foreground">
                {[
                  ["F2", "Search / scan"],
                  ["Enter", "Add top match or scanned code"],
                  ["2.5*code", "Add a quantity (e.g. metres)"],
                  ["F4", "Choose customer"],
                  ["F8", "Hold sale"],
                  ["F9 / Ctrl+Enter", "Take payment"],
                ].map(([k, d]) => (
                  <li key={k} className="flex items-center justify-between gap-3">
                    <span>{d}</span>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{k}</kbd>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {/* Mobile switcher */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border bg-card p-1 shadow-xs lg:hidden">
        {(["products", "cart"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMobileView(v)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors",
              mobileView === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {v === "products" ? (
              <>
                <PackageSearch className="size-4" />
                Products
              </>
            ) : (
              <>
                <ShoppingCart className="size-4" />
                Cart ({cart.length}) · <span className="tabular">{formatMoney(totals.total)}</span>
              </>
            )}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_370px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---------------- Products pane ---------------- */}
        <section className={cn("min-h-0 flex-col rounded-2xl border bg-card shadow-xs lg:overflow-hidden", mobileView === "products" ? "flex" : "hidden", "lg:flex")}>
          <div className="space-y-2.5 border-b p-3">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitSearch();
                    } else if (e.key === "Escape") {
                      setQuery("");
                    }
                  }}
                  placeholder="Search or scan a barcode"
                  className="h-10 rounded-xl bg-background pl-10 pr-20 shadow-none"
                  autoComplete="off"
                  aria-label="Search or scan products"
                />
                <div className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-muted-foreground">
                  <ScanBarcode className="size-4" />
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">F2</kbd>
                </div>
              </div>
              <div className="flex shrink-0 items-center rounded-xl border bg-muted/50 p-0.5" role="group" aria-label="Product view">
                {(
                  [
                    ["grid", LayoutGrid, "Tiles"],
                    ["list", List, "List"],
                  ] as const
                ).map(([v, Icon, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => pickView(v)}
                    aria-label={label}
                    aria-pressed={view === v}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg transition-colors",
                      view === v ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>

            <div className="scrollbar-none -mx-3 flex gap-1.5 overflow-x-auto px-3">
              <CategoryChip active={!category} onClick={() => setCategory(null)} count={products.length}>
                All
              </CategoryChip>
              {categories.map((c) => (
                <CategoryChip
                  key={c.id}
                  active={category === c.id}
                  onClick={() => setCategory(category === c.id ? null : c.id)}
                  count={catCounts.get(c.id) ?? 0}
                  tone={tone.get(c.id)}
                >
                  {c.name}
                </CategoryChip>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 bg-muted/30 p-3 lg:overflow-y-auto">
            {shown.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card text-center text-sm text-muted-foreground">
                <PackageSearch className="size-8" />
                <p>No products match{query ? ` "${query}"` : ""}.</p>
                {(query || category) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setCategory(null);
                    }}
                  >
                    Clear search
                  </Button>
                )}
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))]">
                {shown.map((p, i) => {
                  const st = stockState(p);
                  const qtyInCart = inCart.get(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => add(p)}
                      disabled={st.out}
                      style={{ borderLeftColor: (p.categoryId && tone.get(p.categoryId)) || undefined }}
                      className={cn(
                        "relative flex min-h-[6.25rem] flex-col rounded-xl border border-l-[3px] bg-card p-2.5 text-left shadow-xs transition-[box-shadow,transform,border-color] hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-xs disabled:active:scale-100",
                        flash === p.id && "ring-2 ring-primary/40",
                        i === 0 && query && "ring-1 ring-primary/60"
                      )}
                    >
                      {qtyInCart ? (
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground ring-2 ring-card tabular">
                          {formatQty(qtyInCart)}
                        </span>
                      ) : null}
                      <p className="line-clamp-2 text-[13px] font-medium leading-snug">{p.name}</p>
                      <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                        {p.sku}
                        {p.color ? ` · ${p.color}` : ""}
                      </p>
                      <div className="mt-auto flex items-end justify-between gap-1 pt-2">
                        <p className="tabular text-sm font-semibold leading-none text-primary">
                          {formatMoney(priceFor(p, level))}
                          <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">/{p.unit}</span>
                        </p>
                        <StockPill service={p.type === "service"} {...st} unit={p.unit} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
                <ul className="divide-y">
                  {shown.map((p, i) => {
                    const st = stockState(p);
                    const qtyInCart = inCart.get(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => add(p)}
                          disabled={st.out}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                            flash === p.id && "bg-primary/10",
                            i === 0 && query && "bg-primary/5"
                          )}
                        >
                          <span className="h-8 w-1 shrink-0 rounded-full bg-border" style={{ background: (p.categoryId && tone.get(p.categoryId)) || undefined }} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{p.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {p.sku}
                              {p.color ? ` · ${p.color}` : ""}
                            </p>
                          </div>
                          {qtyInCart ? <Badge className="h-5 rounded-full px-1.5 tabular">×{formatQty(qtyInCart)}</Badge> : null}
                          <StockPill service={p.type === "service"} {...st} unit={p.unit} />
                          <p className="w-24 shrink-0 text-right tabular text-sm font-semibold">
                            {formatMoney(priceFor(p, level))}
                            <span className="block text-[10px] font-normal text-muted-foreground">per {p.unit}</span>
                          </p>
                          <Plus className="size-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {filtered.length > shown.length && <p className="py-3 text-center text-xs text-muted-foreground">Showing {shown.length} of {filtered.length}. Search to narrow down.</p>}
          </div>

          <div className="hidden items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground lg:flex">
            <span className="tabular">
              {filtered.length} product{filtered.length === 1 ? "" : "s"}
              {category || parsed.text ? ` of ${products.length}` : ""}
            </span>
            <span>
              {warehouse?.name ?? "No warehouse"} · {level === "wholesale" ? "Wholesale" : "Retail"} prices
            </span>
          </div>
        </section>

        {/* ---------------- Cart pane ---------------- */}
        <section className={cn("min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm", mobileView === "cart" ? "flex" : "hidden", "lg:flex")}>
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Current sale</h2>
              {cart.length > 0 && (
                <Badge variant="secondary" className="h-5 rounded-full px-1.5 tabular">
                  {cart.length}
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={clearSale} disabled={!cart.length}>
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          </div>

          <div className="space-y-2 border-b p-3">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Combobox
                  id="pos-customer"
                  options={customerOptions}
                  value={customerId ?? WALK_IN}
                  onChange={pickCustomer}
                  placeholder="Customer"
                  searchPlaceholder="Name, phone or code (F4)"
                  className="h-9"
                />
              </div>
              {canAddCustomer && (
                <Button variant="outline" size="icon" className="size-9" onClick={() => setQuickAdd(true)} aria-label="Add customer">
                  <UserPlus className="size-4" />
                </Button>
              )}
            </div>
            {customerId ? (
              <div className="flex flex-wrap items-center gap-1.5 px-0.5 text-xs text-muted-foreground">
                <span>{customer?.hint}</span>
                {customer?.phone && <span>· {customer.phone}</span>}
                {level === "wholesale" && (
                  <Badge variant="secondary" className="h-5">
                    Wholesale prices
                  </Badge>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Name (optional)" className="h-8 text-xs" />
                <Input value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} placeholder="Phone (optional)" className="h-8 text-xs" type="tel" />
              </div>
            )}
          </div>

          <div className="min-h-[12rem] flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ScanBarcode className="size-6" />
                </span>
                <p className="font-medium text-foreground">Ready for the next customer</p>
                <p className="max-w-[16rem]">Scan a barcode or tap a product to start a sale.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {cart.map((l, i) => {
                  const iss = issues[i];
                  const calc = totals.lines[i];
                  return (
                    <li key={l.key} className={cn("space-y-2 px-3 py-2.5", blockedLine(i) && "bg-destructive/5")}>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground tabular">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-tight">{l.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {l.sku}
                            {l.taxRate > 0 && ` · tax ${l.taxRate}%`}
                            {l.discountPct > 0 && ` · ${l.discountPct}% off`}
                          </p>
                        </div>
                        <p className="tabular text-sm font-semibold">{formatMoney(round2(calc.gross - calc.discountAmount))}</p>
                        <button
                          type="button"
                          onClick={() => remove(l.key)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove ${l.name}`}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 pl-7">
                        <div className="flex items-center rounded-lg border bg-background">
                          <button type="button" onClick={() => step(l, -1)} className="flex size-7 items-center justify-center rounded-l-lg hover:bg-muted" aria-label="Less">
                            <Minus className="size-3.5" />
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={l.allowFraction ? 0.01 : 1}
                            value={l.qty}
                            onChange={(e) => update(l.key, { qty: Math.max(0, Number(e.target.value) || 0) })}
                            onBlur={() => {
                              if (l.qty <= 0) remove(l.key);
                              else if (!l.allowFraction && l.qty % 1 !== 0) update(l.key, { qty: Math.max(1, Math.round(l.qty)) });
                            }}
                            className="h-7 w-12 border-x bg-transparent text-center text-sm font-medium tabular outline-none [appearance:textfield] focus:bg-muted/50 [&::-webkit-inner-spin-button]:appearance-none"
                            aria-label="Quantity"
                          />
                          <button type="button" onClick={() => step(l, 1)} className="flex size-7 items-center justify-center rounded-r-lg hover:bg-muted" aria-label="More">
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{l.unit} ×</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={l.price}
                          onChange={(e) => update(l.key, { price: Math.max(0, Number(e.target.value) || 0), priceEdited: true })}
                          className={cn("h-7 w-20 min-w-0 px-2 text-right text-sm tabular", iss.belowMin && (canDiscount ? "border-warning" : "border-destructive"))}
                          aria-label="Price"
                        />
                        <div className="relative ml-auto">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={l.discountPct || ""}
                            placeholder="0"
                            onChange={(e) => update(l.key, { discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                            className="h-7 w-16 pr-5 text-right text-sm tabular"
                            aria-label="Discount percent"
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                      {(iss.short || iss.belowMin) && (
                        <p className={cn("pl-7 text-[11px]", iss.short || !canDiscount ? "text-destructive" : "text-warning-foreground dark:text-warning")}>
                          {iss.short && `Only ${formatQty(iss.available)} ${l.unit} in stock. `}
                          {iss.belowMin && (canDiscount ? `Below minimum ${formatMoney(iss.floor)} (you can approve this).` : `Can't go below ${formatMoney(iss.floor)}.`)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t bg-muted/30">
            <dl className="space-y-1.5 px-3 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Subtotal
                  {cart.length > 0 && (
                    <span className="ml-1 text-xs">
                      ({cart.length} line{cart.length === 1 ? "" : "s"} · {formatQty(itemCount)} qty)
                    </span>
                  )}
                </dt>
                <dd className="tabular">{formatMoney(round2(totals.subtotal - totals.lineDiscounts))}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Bill discount</dt>
                <dd className="flex items-center gap-1">
                  <div className="flex overflow-hidden rounded-md border bg-background text-xs">
                    {(["amount", "percent"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDiscountMode(m)}
                        className={cn("px-2 py-1", discountMode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                      >
                        {m === "amount" ? "Rs" : "%"}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={billDiscount || ""}
                    placeholder="0"
                    onChange={(e) => setBillDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="h-7 w-24 bg-background text-right text-sm tabular"
                    aria-label="Bill discount"
                  />
                </dd>
              </div>
              {totals.documentDiscount > 0 && (
                <div className="flex justify-between text-destructive">
                  <dt>Discount</dt>
                  <dd className="tabular">-{formatMoney(totals.documentDiscount)}</dd>
                </div>
              )}
              {totals.taxTotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Sales tax</dt>
                  <dd className="tabular">{formatMoney(totals.taxTotal)}</dd>
                </div>
              )}
            </dl>
            <div className="mx-3 mt-2.5 flex items-baseline justify-between border-t border-dashed pt-2.5">
              <span className="text-sm font-medium text-muted-foreground">Total payable</span>
              <span className="tabular text-2xl font-bold tracking-tight">{formatMoney(totals.total)}</span>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 p-3">
              <Button variant="outline" className="h-12 px-4" onClick={holdCart} disabled={!cart.length}>
                <Archive className="size-4" />
                Hold
                <kbd className="hidden rounded border bg-muted px-1 font-mono text-[10px] font-normal text-muted-foreground sm:inline">F8</kbd>
              </Button>
              <Button size="lg" className="h-12 justify-between px-4 text-base shadow-md" onClick={openPayment} disabled={!cart.length || pending}>
                <span className="flex items-center gap-2">
                  <Banknote className="size-5" />
                  Take payment
                </span>
                <kbd className="rounded border border-primary-foreground/30 px-1.5 font-mono text-[10px] font-normal opacity-80">F9</kbd>
              </Button>
            </div>
          </div>
        </section>
      </div>

      {cart.length > 0 && mobileView === "products" && (
        <Button size="lg" className="sticky bottom-3 z-10 h-12 justify-between px-4 shadow-lg lg:hidden" onClick={() => setMobileView("cart")}>
          <span className="flex items-center gap-2">
            <ShoppingCart className="size-4" />
            View cart ({cart.length})
          </span>
          <span className="tabular text-lg font-bold">{formatMoney(totals.total)}</span>
        </Button>
      )}

      <PaymentDialog
        key={payKey}
        open={payOpen}
        onOpenChange={setPayOpen}
        total={totals.total}
        customerName={customer ? `${customer.label} · ${customer.hint}` : walkInName.trim() || "Walk-in customer"}
        hasAccount={!!customerId}
        accounts={accounts}
        pending={pending}
        onComplete={complete}
      />

      {canAddCustomer && (
        <QuickCustomerDialog
          open={quickAdd}
          onOpenChange={setQuickAdd}
          initialName={walkInName}
          onCreated={(c: NewCustomer) => {
            setCustomers((list) => [...list, { value: c.id, label: c.name, hint: c.code, keywords: c.phone ?? "", priceLevel: c.priceLevel, phone: c.phone }].sort((a, b) => a.label.localeCompare(b.label)));
            setCustomerId(c.id);
            setCart((cl) =>
              cl.map((l) => {
                const p = byId.get(l.productId);
                return p && !l.priceEdited ? { ...l, price: priceFor(p, c.priceLevel) } : l;
              })
            );
          }}
        />
      )}

      <Dialog open={!!receipt} onOpenChange={(o) => !o && newSale()}>
        <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-md">
          <DialogHeader className="no-print">
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="size-5 text-success" />
              Sale complete
            </DialogTitle>
            <DialogDescription>
              {receipt && receipt.change > 0 ? (
                <span className="text-base">
                  Give change <span className="tabular text-lg font-bold text-success">{formatMoney(receipt.change)}</span>
                </span>
              ) : receipt && receipt.balanceDue > 0 ? (
                <span>
                  {formatMoney(receipt.balanceDue)} put on {receipt.customerName}&apos;s account.
                </span>
              ) : (
                "Paid in full."
              )}
            </DialogDescription>
          </DialogHeader>
          {receipt && <ThermalReceipt data={receipt} />}
          <DialogFooter className="no-print gap-2 sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="size-4" />
                Print
              </Button>
              {receipt && (
                <Button variant="ghost" asChild>
                  <Link href={`/sales/invoices/${receipt.invoiceId}`}>View invoice</Link>
                </Button>
              )}
            </div>
            <Button onClick={newSale} autoFocus>
              New sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StockPill({ service, out, low, left, unit }: { service: boolean; out: boolean; low: boolean; left: number; unit: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none tabular",
        service
          ? "bg-info/12 text-info"
          : out
            ? "bg-destructive/10 text-destructive"
            : low
              ? "bg-warning/15 text-warning-foreground dark:text-warning"
              : "bg-success/12 text-success"
      )}
    >
      {service ? "Service" : out ? "Out" : `${formatQty(left)} ${unit}`}
    </span>
  );
}

function CategoryChip({
  active,
  onClick,
  count,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-background hover:border-primary/40 hover:bg-accent"
      )}
    >
      {tone && <span className="size-2 rounded-full" style={{ background: tone }} />}
      {children}
      <span className={cn("tabular text-[11px]", active ? "text-primary-foreground/75" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}
