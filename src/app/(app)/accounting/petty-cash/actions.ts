"use server";

import { action } from "@/server/action";
import { createFund, createVoucher, updateFund, voidVoucher } from "@/server/services/finance-petty-cash";
import { fundSchema, voidSchema, voucherSchema } from "@/server/services/finance-shared";

export const saveFund = action(
  { permission: "accounting.pettycash", schema: fundSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => (input.id ? updateFund(tx, actor, { ...input, id: input.id }) : createFund(tx, actor, input))
);

export const saveVoucher = action(
  { permission: "accounting.pettycash", schema: voucherSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => createVoucher(tx, actor, input)
);

export const voidPettyCashVoucher = action(
  { permission: "accounting.pettycash", schema: voidSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => voidVoucher(tx, actor, input)
);
