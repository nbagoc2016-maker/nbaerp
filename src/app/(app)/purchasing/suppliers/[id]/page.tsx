import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, FileText, HandCoins, Pencil, ShoppingCart, Wallet } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import { readPeriod } from "@/lib/period";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { PrintButton } from "@/components/app/print-button";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { SupplierActiveToggle } from "@/components/purchasing/doc-actions";
import { SummaryList } from "@/components/purchasing/related-docs";
import { SupplierStatement } from "@/components/purchasing/statement";
import { BillsTable, PaymentsTable, PurchaseOrdersTable } from "@/components/purchasing/tables";
import { UrlTabs } from "@/components/purchasing/url-tabs";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { listBills, listPayments, listPurchaseOrders } from "@/server/queries/purchasing";
import { getSupplier, supplierOverview, supplierStatement } from "@/server/queries/suppliers";

const TABS = ["overview", "statement", "orders", "bills", "payments"] as const;

export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
  const user = await requirePermission("parties.view");
  const { id } = await params;
  const sp = await searchParams;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  const canPurchasing = can(user, "purchasing.view");
  const tab = TABS.includes(sp.tab as (typeof TABS)[number]) ? (sp.tab as string) : "overview";
  const company = await getCompany();
  const period = readPeriod(sp);
  const [overview, statement, orders, bills, payments] = await Promise.all([
    supplierOverview(id),
    tab === "statement" ? supplierStatement(id, period.from, period.to) : null,
    canPurchasing && tab === "orders" ? listPurchaseOrders({ supplierId: id }) : [],
    canPurchasing && tab === "bills" ? listBills({ supplierId: id }) : [],
    canPurchasing && tab === "payments" ? listPayments({ supplierId: id }) : [],
  ]);

  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "statement", label: "Statement" },
    ...(canPurchasing
      ? [
          { value: "orders", label: "Purchase orders" },
          { value: "bills", label: "Bills" },
          { value: "payments", label: "Payments" },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={[supplier.code, supplier.city, supplier.phone].filter(Boolean).join(" · ")}
        backHref="/purchasing/suppliers"
        badge={<StatusBadge status={supplier.isActive ? "active" : "inactive"} />}
        actions={
          <>
            {tab === "statement" && <PrintButton label="Print statement" />}
            {can(user, "purchasing.create") && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/purchasing/orders/new?supplier=${id}`}>
                  <ShoppingCart className="size-4" />
                  New PO
                </Link>
              </Button>
            )}
            {can(user, "purchasing.payments") && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/purchasing/payments/new?supplier=${id}`}>
                  <HandCoins className="size-4" />
                  Record payment
                </Link>
              </Button>
            )}
            {can(user, "parties.manage") && (
              <>
                <SupplierActiveToggle id={id} isActive={supplier.isActive} />
                <Button asChild size="sm">
                  <Link href={`/purchasing/suppliers/${id}/edit`}>
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      <UrlTabs value={tab} tabs={tabs}>
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={overview.balance < 0 ? "Advance with supplier" : "We owe"}
              value={formatMoney(Math.abs(overview.balance))}
              icon={Wallet}
              tone={overview.balance < 0 ? "info" : "default"}
              hint="From the ledger"
            />
            <StatCard label="Open bills" value={formatMoney(overview.openBills)} icon={FileText} hint={`${overview.billCount} bill${overview.billCount === 1 ? "" : "s"} posted`} />
            <StatCard label="Due in 7 days" value={formatMoney(overview.dueWeek)} icon={CalendarClock} tone="warning" />
            <StatCard label="Overdue" value={formatMoney(overview.overdue)} icon={AlertTriangle} tone="danger" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent>
                <SummaryList
                  items={[
                    { label: "Contact person", value: supplier.contactPerson || "—" },
                    { label: "Phone", value: [supplier.phone, supplier.altPhone].filter(Boolean).join(", ") || "—" },
                    { label: "Email", value: supplier.email || "—" },
                    { label: "Address", value: [supplier.address, supplier.city].filter(Boolean).join(", ") || "—" },
                    { label: "NTN / STRN", value: supplier.taxNumber || "—" },
                    { label: "CNIC", value: supplier.cnic || "—" },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Terms & activity</CardTitle>
              </CardHeader>
              <CardContent>
                <SummaryList
                  items={[
                    { label: "Payment terms", value: supplier.paymentTermsDays ? `${supplier.paymentTermsDays} days` : "Due on receipt" },
                    { label: "Credit limit", value: supplier.creditLimit ? formatMoney(supplier.creditLimit) : "—" },
                    { label: "Opening balance", value: formatMoney(supplier.openingBalance) },
                    { label: "Purchases (last 12 months)", value: formatMoney(overview.purchases12m) },
                    {
                      label: "Last bill",
                      value: overview.lastBill ? (
                        <Link href={`/purchasing/bills/${overview.lastBill.id}`} className="text-primary hover:underline">
                          {overview.lastBill.number} · {formatDate(overview.lastBill.date)} · {formatMoney(overview.lastBill.total)}
                        </Link>
                      ) : (
                        "—"
                      ),
                    },
                    {
                      label: "Last payment",
                      value: overview.lastPayment ? (
                        <Link href={`/purchasing/payments/${overview.lastPayment.id}`} className="text-primary hover:underline">
                          {overview.lastPayment.number} · {formatDate(overview.lastPayment.date)} · {formatMoney(overview.lastPayment.amount)}
                        </Link>
                      ) : (
                        "—"
                      ),
                    },
                  ]}
                />
                {supplier.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{supplier.notes}</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="statement" className="space-y-4">
          <div className="no-print">
            <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
          </div>
          {statement && <SupplierStatement company={company} supplier={supplier} from={period.from} to={period.to} data={statement} />}
        </TabsContent>

        {canPurchasing && (
          <>
            <TabsContent value="orders">
              <PurchaseOrdersTable data={orders} hideSupplier canCreate={can(user, "purchasing.create")} />
            </TabsContent>
            <TabsContent value="bills">
              <BillsTable data={bills} hideSupplier canCreate={can(user, "purchasing.create")} />
            </TabsContent>
            <TabsContent value="payments">
              <PaymentsTable data={payments} hideSupplier canCreate={can(user, "purchasing.payments")} />
            </TabsContent>
          </>
        )}
      </UrlTabs>
    </>
  );
}
