import { notFound } from "next/navigation";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { ReturnForm } from "@/components/purchasing/return-form";
import { can, requirePermission } from "@/server/auth";
import { returnPrefillFromBill } from "@/server/queries/purchasing";
import { returnableBillOptions } from "@/server/queries/purchasing-forms";

export default async function NewReturnPage({ searchParams }: { searchParams: Promise<{ bill?: string }> }) {
  const user = await requirePermission("purchasing.create");
  const sp = await searchParams;
  const [bills, prefill] = await Promise.all([returnableBillOptions(), sp.bill ? returnPrefillFromBill(sp.bill) : null]);
  if (sp.bill && !prefill) notFound();

  return (
    <>
      <PageHeader
        title="New purchase return"
        description={prefill ? `Returning goods billed on ${prefill.bill.number} by ${prefill.supplier.name}.` : "Send goods back to a supplier against their bill."}
        backHref={prefill ? `/purchasing/bills/${prefill.bill.id}` : "/purchasing/returns"}
      />
      <ReturnForm
        key={sp.bill ?? "none"}
        bills={bills}
        lines={prefill?.lines ?? []}
        canPost={can(user, "purchasing.post")}
        initial={{
          billId: prefill?.bill.id ?? null,
          date: today(),
          reason: "",
          qty: {},
          batch: Object.fromEntries((prefill?.lines ?? []).filter((l) => l.rolls.length === 1).map((l) => [l.billLineId, l.rolls[0].id])),
        }}
      />
    </>
  );
}
