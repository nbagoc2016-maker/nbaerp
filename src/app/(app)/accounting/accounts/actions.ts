"use server";

import { z } from "zod";
import { action } from "@/server/action";
import { createAccount, deleteAccount, setAccountActive, updateAccount } from "@/server/services/finance-accounts";
import { accountSchema } from "@/server/services/finance-shared";
import { zId } from "@/lib/schemas";

export const saveAccount = action(
  { permission: "accounting.accounts", schema: accountSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => {
    const acc = input.id ? await updateAccount(tx, actor, { ...input, id: input.id }) : await createAccount(tx, actor, input);
    return { id: acc.id };
  }
);

export const setAccountStatus = action(
  { permission: "accounting.accounts", schema: z.object({ id: zId, active: z.boolean() }), revalidate: ["/accounting"] },
  async (input, { tx, actor }) => {
    await setAccountActive(tx, actor, input);
    return { id: input.id };
  }
);

export const removeAccount = action(
  { permission: "accounting.accounts", schema: z.object({ id: zId }), revalidate: ["/accounting"] },
  async (input, { tx, actor }) => {
    await deleteAccount(tx, actor, input.id);
    return { id: input.id };
  }
);
