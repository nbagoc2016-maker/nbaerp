"use server";

import { action } from "@/server/action";
import { deleteTransfer, postTransfer, saveTransfer, voidTransfer } from "@/server/services/inventory";
import { idSchema, transferSchema, voidSchema } from "@/server/services/inventory-schemas";

const revalidate = ["/inventory"];

export const saveTransferAction = action({ permission: "inventory.transfer", schema: transferSchema, revalidate }, async (input, { tx, actor }) =>
  saveTransfer(tx, actor, input)
);

/** Save the draft and post it in one go */
export const saveAndPostTransferAction = action({ permission: "inventory.transfer", schema: transferSchema, revalidate }, async (input, { tx, actor }) => {
  const { id } = await saveTransfer(tx, actor, input);
  return postTransfer(tx, actor, id);
});

export const postTransferAction = action({ permission: "inventory.transfer", schema: idSchema, revalidate }, async (input, { tx, actor }) =>
  postTransfer(tx, actor, input.id)
);

export const voidTransferAction = action({ permission: "inventory.transfer", schema: voidSchema, revalidate }, async (input, { tx, actor }) =>
  voidTransfer(tx, actor, input.id, input.reason)
);

export const deleteTransferAction = action({ permission: "inventory.transfer", schema: idSchema, revalidate }, async (input, { tx, actor }) =>
  deleteTransfer(tx, actor, input.id)
);
