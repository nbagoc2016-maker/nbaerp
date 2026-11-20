import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, HandCoins, Pencil, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { PrintButton } from "@/components/app/print-button";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { CUSTOMER_TYPE_LABEL, InfoList, PrintChrome } from "@/components/sales/common";
import { InvoicesTable, ReceiptsTable } from "@/components/sales/tables";
import { UrlTabs } from "@/components/sales/url-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TabsContent } from "@/components/ui/tabs";
import { formatDate, formatMoney, round2, today } from "@/lib/format";
import { readPeriod } from "@/lib/period";
import { cn } from "@/lib/utils";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { customerInvoices, customerReceiptsList, customerStatement, getCustomer } from "@/server/queries/customers";

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
  const user = await requirePermission("parties.view");
  const { id } = await params;
  const sp = await searchParams;
  const c = await getCustomer(id);
  if (!c) notFound();
  const company = await getCompany();
  const period = readPeriod(sp);
  const tab = ["overview", "statement", "invoices", "receipts"].includes(sp.tab ?? "") ? sp.tab! : "overview";

  const [statement, invoices, receipts] = await Promise.all([customerStatement(id, period.from, period.to), customerInvoices(id), customerReceiptsList(id)]);
  const t = today();
  const invoiceRows = invoices.map((i) => ({
    ...i,
    customerName: c.name,
    balance: i.status === "posted" ? round2(i.total - i.amountPaid) : 0,
    overdue: i.status === "posted" && i.paymentStatus !== "paid" && !!i.dueDate && i.dueDate < t,
  }));
  const receiptRows = receipts.map((r) => ({ ...r, customerName: c.name, unallocated: round2(r.amount - r.allocated) }));
  const creditUsedPct = c.creditLimit > 0 ? Math.min(100, (Math.max(0, c.balance) / c.creditLimit) * 100) : 0;
  const canSell = can(user, "sales.create");
  const canReceive = can(user, "sales.receipts");

  return (
    <>
      <PrintChrome />
      <PageHeader
        title={c.name}
        description={`${c.code} · ${CUSTOMER_TYPE_LABEL[c.type]}${c.city ? ` · ${c.city}` : ""}${c.phone ? ` · ${c.phone}` : ""}`}
        backHref="/sales/customers"
        badge={<StatusBadge status={c.isActive ? "active" : "inactive"} />}
        actions={
          <>
            {can(user, "parties.manage") && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/sales/customers/${c.id}/edit`}>
                  <Pencil className="size-4" />
                  Edit
                </Link>
              </Button>
            )}
            {canReceive && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/sales/receipts/new?customer=${c.id}`}>
                  <HandCoins className="size-4" />
                  Record payment
                </Link>
              </Button>
            )}
            {canSell && (
              <Button asChild size="sm">
                <Link href={`/sales/invoices/new?customer=${c.id}`}>
                  <ReceiptText className="size-4" />
                  New invoice
                </Link>
              </Button>
            )}
          </>
        }
      />

      <UrlTabs
        value={tab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "statement", label: "Statement" },
          { value: "invoices", label: `Invoices (${invoices.length})` },
          { value: "receipts", label: `Receipts (${receipts.length})` },
        ]}
      >
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={c.balance < 0 ? "Credit on account" : "Balance owed"}
              value={<Money value={Math.abs(c.balance)} />}
              icon={Wallet}
              tone={c.balance > 0 ? (c.overdue > 0 ? "danger" : "warning") : "success"}
              hint={c.overdue > 0 ? `${formatMoney(c.overdue)} overdue` : "Nothing overdue"}
            />
            <StatCard label="Total sales" value={<Money value={c.totalSales} />} icon={TrendingUp} hint={`${c.invoiceCount} posted invoice${c.invoiceCount === 1 ? "" : "s"}`} />
            <StatCard label="Last sale" value={c.lastSale ? formatDate(c.lastSale) : "—"} icon={CalendarClock} tone="info" hint={`Received ${formatMoney(c.totalReceived)} in total`} />
            <Card className="gap-0 py-0">
              <CardContent className="space-y-3 p-5">
                <p className="text-sm font-medium text-muted-foreground">Credit used</p>
                {c.creditLimit > 0 ? (
                  <>
                    <p className="tabular text-2xl font-semibold tracking-tight">{Math.round(creditUsedPct)}%</p>
                    <Progress value={creditUsedPct} className={cn("h-2", creditUsedPct >= 100 && "bg-destructive/20 [&>[data-slot=progress-indicator]]:bg-destructive")} />
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(Math.max(0, c.balance))} of {formatMoney(c.creditLimit)} limit
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-semibold tracking-tight">No limit</p>
                    <p className="text-xs text-muted-foreground">Set a credit limit to get warnings on big sales</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Contact & terms</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoList
                  className="lg:grid-cols-3"
                  items={[
                    { label: "Contact person", value: c.contactPerson },
                    { label: "Phone", value: [c.phone, c.altPhone].filter(Boolean).join(" / ") || null },
                    { label: "Email", value: c.email },
                    { label: "Address", value: [c.address, c.city].filter(Boolean).join(", ") || null },
                    { label: "NTN / STRN", value: c.taxNumber },
                    { label: "CNIC", value: c.cnic },
                    { label: "Payment terms", value: c.paymentTermsDays ? `${c.paymentTermsDays} days` : "Due on invoice" },
                    { label: "Price list", value: c.priceLevel === "wholesale" ? "Wholesale" : "Retail" },
                    { label: "Opening balance", value: <Money value={c.openingBalance} muteZero /> },
                  ]}
                />
                {c.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{c.notes}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Open invoices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {invoiceRows.filter((i) => i.balance > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
                ) : (
                  invoiceRows
                    .filter((i) => i.balance > 0)
                    .slice(0, 6)
                    .map((i) => (
                      <Link key={i.id} href={`/sales/invoices/${i.id}`} className="flex items-center justify-between rounded-lg border p-2.5 text-sm hover:bg-muted/40">
                        <div>
                          <p className="font-medium">{i.number}</p>
                          <p className={cn("text-xs", i.overdue ? "text-destructive" : "text-muted-foreground")}>
                            {i.overdue ? "Overdue · " : "Due "}
                            {formatDate(i.dueDate ?? i.date)}
                          </p>
                        </div>
                        <Money value={i.balance} className="font-medium" />
                      </Link>
                    ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="statement">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Statement of account</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {company.name} · {formatDate(period.from)} – {formatDate(period.to)}
                </p>
              </div>
              <div className="no-print flex flex-wrap items-center gap-2">
                <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
                <PrintButton />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Document</th>
                      <th className="px-3 py-2 text-left">Details</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(period.from)}</td>
                      <td className="px-3 py-2" colSpan={4}>
                        Opening balance
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular">{formatMoney(statement.opening, { fixed: true })}</td>
                    </tr>
                    {statement.lines.length === 0 && (
                      <tr className="border-t">
                        <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                          No transactions in this period.
                        </td>
                      </tr>
                    )}
                    {statement.lines.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="whitespace-nowrap px-3 py-2">{formatDate(l.date)}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {l.href ? (
                            <Link href={l.href} className="font-medium text-primary hover:underline">
                              {l.sourceNumber ?? l.entryNumber}
                            </Link>
                          ) : (
                            <span className="font-medium">{l.sourceNumber ?? l.entryNumber}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{l.memo ?? l.lineMemo}</td>
                        <td className="px-3 py-2 text-right tabular">{l.debit ? formatMoney(l.debit, { fixed: true }) : ""}</td>
                        <td className="px-3 py-2 text-right tabular">{l.credit ? formatMoney(l.credit, { fixed: true }) : ""}</td>
                        <td className="px-3 py-2 text-right font-medium tabular">{formatMoney(l.balance, { fixed: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/40 font-semibold">
                    <tr>
                      <td className="px-3 py-2.5" colSpan={3}>
                        Closing balance {statement.closing < 0 ? "(credit)" : ""}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">{formatMoney(statement.debit, { fixed: true })}</td>
                      <td className="px-3 py-2.5 text-right tabular">{formatMoney(statement.credit, { fixed: true })}</td>
                      <td className="px-3 py-2.5 text-right tabular">{formatMoney(statement.closing, { fixed: true })}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <InvoicesTable data={invoiceRows} exportName={`invoices-${c.code}`} compact />
        </TabsContent>

        <TabsContent value="receipts">
          <ReceiptsTable data={receiptRows} compact />
        </TabsContent>
      </UrlTabs>
    </>
  );
}
