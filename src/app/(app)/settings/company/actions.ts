"use server";

import { action } from "@/server/action";
import { companySchema, lockDateSchema, seriesSchema, setLockDate, updateCompany, updateNumberSeries } from "@/server/services/admin";

export const saveCompany = action({ permission: "settings.company", schema: companySchema, revalidate: ["/"] }, async (input, { tx, actor }) =>
  updateCompany(tx, actor, input)
);

export const saveNumberSeries = action({ permission: "settings.company", schema: seriesSchema, revalidate: ["/settings/company"] }, async (input, { tx, actor }) =>
  updateNumberSeries(tx, actor, input)
);

export const saveLockDate = action(
  { permission: ["settings.company", "accounting.close"], schema: lockDateSchema, revalidate: ["/settings/company"] },
  async (input, { tx, actor }) => setLockDate(tx, actor, input)
);
