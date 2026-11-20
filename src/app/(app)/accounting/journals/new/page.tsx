import { PageHeader } from "@/components/app/page-header";
import { JournalForm } from "@/components/accounting/journal-form";
import { today } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { partyPickerOptions } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { accountOptions } from "@/server/queries/options";

export default async function NewJournalPage() {
  await requirePermission("accounting.journal");
  const [accounts, parties, company] = await Promise.all([accountOptions(), partyPickerOptions(), getCompany()]);
  return (
    <>
      <PageHeader title="New journal entry" description="Post a balanced double entry directly to the general ledger." backHref="/accounting/journals" />
      <JournalForm accounts={accounts} parties={parties} defaultDate={today()} lockDate={company.lockDate ?? null} />
    </>
  );
}
