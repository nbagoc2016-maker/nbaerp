"use server";
import { action } from "@/server/action";
import { deletePurchaseReturn, postPurchaseReturn, savePurchaseReturn, voidPurchaseReturn } from "@/server/services/purchasing-payments";
import { idSchema, purchaseReturnSchema, voidSchema } from "@/server/services/purchasing-schemas";
import { assertCanCreate, PURCHASING_PATHS } from "../actions-shared";

export const savePurchaseReturnAction = action(
  { permission: "purchasing.create", schema: purchaseReturnSchema, revalidate: PURCHASING_PATHS },
  async (input, { tx, actor }) => savePurchaseReturn(tx, actor, input)
);

export const saveAndPostPurchaseReturn = action(
  { permission: "purchasing.post", schema: purchaseReturnSchema, revalidate: PURCHASING_PATHS },
  async (input, { tx, actor, user }) => {
    assertCanCreate(user);
    const res = await savePurchaseReturn(tx, actor, input);
    await postPurchaseReturn(tx, actor, { id: res.id });
    return res;
  }
);

export const postPurchaseReturnAction = action({ permission: "purchasing.post", schema: idSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  postPurchaseReturn(tx, actor, input)
);

export const voidPurchaseReturnAction = action({ permission: "purchasing.void", schema: voidSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  voidPurchaseReturn(tx, actor, input)
);

export const deletePurchaseReturnAction = action({ permission: "purchasing.create", schema: idSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  deletePurchaseReturn(tx, actor, input)
);
