"use server";
import { action } from "@/server/action";
import { deleteGoodsReceipt, postGoodsReceipt, saveGoodsReceipt, voidGoodsReceipt } from "@/server/services/purchasing";
import { goodsReceiptSchema, idSchema, voidSchema } from "@/server/services/purchasing-schemas";
import { assertCanCreate, PURCHASING_PATHS } from "../actions-shared";

export const saveGoodsReceiptAction = action(
  { permission: "purchasing.create", schema: goodsReceiptSchema, revalidate: PURCHASING_PATHS },
  async (input, { tx, actor }) => saveGoodsReceipt(tx, actor, input)
);

export const saveAndPostGoodsReceipt = action(
  { permission: "purchasing.post", schema: goodsReceiptSchema, revalidate: PURCHASING_PATHS },
  async (input, { tx, actor, user }) => {
    assertCanCreate(user);
    const res = await saveGoodsReceipt(tx, actor, input);
    await postGoodsReceipt(tx, actor, { id: res.id });
    return res;
  }
);

export const postGoodsReceiptAction = action({ permission: "purchasing.post", schema: idSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  postGoodsReceipt(tx, actor, input)
);

export const voidGoodsReceiptAction = action({ permission: "purchasing.void", schema: voidSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  voidGoodsReceipt(tx, actor, input)
);

export const deleteGoodsReceiptAction = action({ permission: "purchasing.create", schema: idSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  deleteGoodsReceipt(tx, actor, input)
);
