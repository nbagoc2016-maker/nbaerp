"use server";
import { action } from "@/server/action";
import { recordSupplierPayment, voidSupplierPayment } from "@/server/services/purchasing-payments";
import { supplierPaymentSchema, voidSchema } from "@/server/services/purchasing-schemas";
import { PURCHASING_PATHS } from "../actions-shared";

export const recordSupplierPaymentAction = action(
  { permission: "purchasing.payments", schema: supplierPaymentSchema, revalidate: PURCHASING_PATHS },
  async (input, { tx, actor }) => recordSupplierPayment(tx, actor, input)
);

export const voidSupplierPaymentAction = action({ permission: "purchasing.void", schema: voidSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  voidSupplierPayment(tx, actor, input)
);
