import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { ReturnActions } from "@/components/purchasing/doc-actions";
import { printLine } from "@/components/purchasing/doc-lines";
import { RelatedDocs } from "@/components/purchasing/related-docs";
import { Signatures } from "@/components/purchasing/signatures";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getReturn } from "@/server/queries/purchasing";

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("purchasing.view");
  const { id } = await params;
  const [data, company] = await Promise.all([getReturn(id), getCompany()]);
  if (!data) notFound();
  const { ret, supplier, lines } = data;

  return (
    <>
      <PageHeader
        title={ret.number}
        description={`Goods returned to ${supplier.name}${data.billNumber ? ` against ${data.billNumber}` : ""}`}
        backHref="/purchasing/returns"
        badge={<StatusBadge status={ret.status} />}
        actions={
          <>
            <PrintButton />
            <ReturnActions
              id={ret.id}
              number={ret.number}
              status={ret.status}
              perms={{ create: can(user, "purchasing.create"), post: can(user, "purchasing.post"), void: can(user, "purchasing.void") }}
            />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PrintDocument
          company={company}
          title="Debit Note"
          number={ret.number}
          date={ret.date}
          meta={[
            ...(data.billNumber ? [{ label: "Against bill", value: data.billNumber }] : []),
            ...(data.supplierInvoiceNo ? [{ label: "Supplier invoice", value: data.supplierInvoiceNo }] : []),
            { label: "From warehouse", value: data.warehouseName },
          ]}
          party={{ label: "Returned to", name: supplier.name, lines: [[supplier.address, supplier.city].filter(Boolean).join(", "), supplier.phone] }}
          lines={lines.map((l) => printLine({ ...l, description: l.batchNo ? `${l.description} — roll ${l.batchNo}` : l.description }))}
          totals={[
            { label: "Subtotal", value: ret.subtotal },
            ...(ret.taxTotal ? [{ label: "Tax", value: ret.taxTotal }] : []),
            { label: "Total credit", value: ret.total, strong: true },
          ]}
          notes={ret.reason}
          footer={<Signatures labels={["Prepared by", "Dispatched by", "Supplier acknowledgement"]} />}
        />
        <div className="no-print space-y-6">
          <RelatedDocs
            groups={[
              { label: "Supplier", docs: [{ href: `/purchasing/suppliers/${supplier.id}`, number: supplier.name }] },
              { label: "Bill", docs: ret.billId && data.billNumber ? [{ href: `/purchasing/bills/${ret.billId}`, number: data.billNumber }] : [] },
            ]}
          />
        </div>
      </div>
    </>
  );
}
