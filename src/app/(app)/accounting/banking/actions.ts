"use server";

import { z } from "zod";
import { action } from "@/server/action";
import { zId, zOptText } from "@/lib/schemas";
import { createBankAccount, createTransfer, updateBankAccount, voidTransfer } from "@/server/services/finance-banking";
import { bankAccountSchema, transferSchema, voidSchema } from "@/server/services/finance-shared";

export const addBankAccount = action(
  { permission: "accounting.banking", schema: bankAccountSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => createBankAccount(tx, actor, input)
);

export const editBankAccount = action(
  {
    permission: "accounting.banking",
    schema: z.object({
      id: zId,
      name: z.string().trim().min(2, "Enter a name"),
      bankName: zOptText,
      accountTitle: zOptText,
      accountNumber: zOptText,
      iban: zOptText,
      branch: zOptText,
    }),
    revalidate: ["/accounting"],
  },
  async (input, { tx, actor }) => updateBankAccount(tx, actor, input)
);

export const saveTransfer = action(
  { permission: "accounting.banking", schema: transferSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => createTransfer(tx, actor, input)
);

export const voidBankTransfer = action(
  { permission: "accounting.banking", schema: voidSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => voidTransfer(tx, actor, input)
);
