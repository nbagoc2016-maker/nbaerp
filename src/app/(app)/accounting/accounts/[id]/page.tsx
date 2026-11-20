import { redirect } from "next/navigation";

// An account's page is its ledger
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/accounting/ledger?account=${encodeURIComponent(id)}`);
}
