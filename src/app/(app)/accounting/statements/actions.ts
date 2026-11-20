"use server";

import { action } from "@/server/action";
import { setLockDate } from "@/server/services/finance-close";
import { lockDateSchema } from "@/server/services/finance-shared";

export const setBooksLockDate = action(
  { permission: "accounting.close", schema: lockDateSchema, revalidate: ["/"] },
  async (input, { tx, actor }) => setLockDate(tx, actor, input)
);
