"use server";

import { action } from "@/server/action";
import { deleteAdjustment, postAdjustment, saveAdjustment, voidAdjustment } from "@/server/services/inventory";
import { adjustmentSchema, idSchema, voidSchema } from "@/server/services/inventory-schemas";

const revalidate = ["/inventory"];

export const saveAdjustmentAction = action({ permission: "inventory.adjust", schema: adjustmentSchema, revalidate }, async (input, { tx, actor }) =>
  saveAdjustment(tx, actor, input)
);

/** Save the draft and post it in one go */
export const saveAndPostAdjustmentAction = action({ permission: "inventory.adjust", schema: adjustmentSchema, revalidate }, async (input, { tx, actor }) => {
  const { id } = await saveAdjustment(tx, actor, input);
  return postAdjustment(tx, actor, id);
});

export const postAdjustmentAction = action({ permission: "inventory.adjust", schema: idSchema, revalidate }, async (input, { tx, actor }) =>
  postAdjustment(tx, actor, input.id)
);

export const voidAdjustmentAction = action({ permission: "inventory.adjust", schema: voidSchema, revalidate }, async (input, { tx, actor }) =>
  voidAdjustment(tx, actor, input.id, input.reason)
);

export const deleteAdjustmentAction = action({ permission: "inventory.adjust", schema: idSchema, revalidate }, async (input, { tx, actor }) =>
  deleteAdjustment(tx, actor, input.id)
);
