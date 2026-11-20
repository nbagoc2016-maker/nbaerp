"use client";

import { Combobox, type ComboOption } from "@/components/app/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PartyType } from "@/server/services/finance-shared";
import { useSetParams } from "./url-filters";

/** Account + optional party pickers for the general ledger; state lives in the URL. */
export function LedgerControls({
  accounts,
  parties,
  accountId,
  partyType,
  partyId,
}: {
  accounts: ComboOption[];
  parties: Record<PartyType, ComboOption[]>;
  accountId: string | null;
  partyType: PartyType | null;
  partyId: string | null;
}) {
  const set = useSetParams();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-80">
        <Combobox options={accounts} value={accountId} onChange={(v) => set({ account: v })} placeholder="Choose an account" searchPlaceholder="Code or name…" />
      </div>
      <Select value={partyType ?? "none"} onValueChange={(v) => set({ partyType: v === "none" ? null : v, partyId: null })}>
        <SelectTrigger className="h-9 w-36" aria-label="Party type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">All parties</SelectItem>
          <SelectItem value="customer">Customer</SelectItem>
          <SelectItem value="supplier">Supplier</SelectItem>
          <SelectItem value="employee">Employee</SelectItem>
        </SelectContent>
      </Select>
      {partyType && (
        <div className="w-full sm:w-64">
          <Combobox options={parties[partyType]} value={partyId} onChange={(v) => set({ partyId: v })} placeholder={`Choose ${partyType}`} allowClear />
        </div>
      )}
    </div>
  );
}
