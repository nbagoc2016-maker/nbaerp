"use server";

import { action } from "@/server/action";
import { createManualJournal, voidManualJournal } from "@/server/services/finance-journals";
import { manualJournalSchema, voidSchema } from "@/server/services/finance-shared";

export const saveJournal = action(
  { permission: "accounting.journal", schema: manualJournalSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => createManualJournal(tx, actor, input)
);

export const voidJournalEntry = action(
  { permission: "accounting.journal", schema: voidSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => voidManualJournal(tx, actor, input)
);
