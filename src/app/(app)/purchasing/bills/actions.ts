"use server";
import { action } from "@/server/action";
import { deleteSupplierBill, postSupplierBill, saveSupplierBill, voidSupplierBill } from "@/server/services/purchasing-bills";
import { idSchema, supplierBillSchema, voidSchema } from "@/server/services/purchasing-schemas";
import { assertCanCreate, PURCHASING_PATHS } from "../actions-shared";

export const saveSupplierBillAction = action(
  { permission: "purchasing.create", schema: supplierBillSchema, revalidate: PURCHASING_PATHS },
  async (input, { tx, actor }) => saveSupplierBill(tx, actor, input)
);

export const saveAndPostSupplierBill = action(
  { permission: "purchasing.post", schema: supplierBillSchema, revalidate: PURCHASING_PATHS },
  async (input, { tx, actor, user }) => {
    assertCanCreate(user);
    const res = await saveSupplierBill(tx, actor, input);
    await postSupplierBill(tx, actor, { id: res.id });
    return res;
  }
);

export const postSupplierBillAction = action({ permission: "purchasing.post", schema: idSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  postSupplierBill(tx, actor, input)
);

export const voidSupplierBillAction = action({ permission: "purchasing.void", schema: voidSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  voidSupplierBill(tx, actor, input)
);

export const deleteSupplierBillAction = action({ permission: "purchasing.create", schema: idSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  deleteSupplierBill(tx, actor, input)
);
