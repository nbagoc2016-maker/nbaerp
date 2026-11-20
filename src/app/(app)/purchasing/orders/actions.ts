"use server";
import { action } from "@/server/action";
import { can } from "@/server/auth";
import { AppError } from "@/server/errors";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  deletePurchaseOrder,
  markPurchaseOrderSent,
  savePurchaseOrder,
} from "@/server/services/purchasing";
import { idSchema, purchaseOrderSchema } from "@/server/services/purchasing-schemas";
import { PURCHASING_PATHS } from "../actions-shared";

export const savePurchaseOrderAction = action(
  { permission: "purchasing.create", schema: purchaseOrderSchema, revalidate: PURCHASING_PATHS },
  async (input, { tx, actor }) => savePurchaseOrder(tx, actor, input)
);

/** Save and approve in one step (needs purchasing.approve as well). */
export const saveAndApprovePurchaseOrder = action(
  { permission: "purchasing.create", schema: purchaseOrderSchema, revalidate: PURCHASING_PATHS },
  async (input, { tx, actor, user }) => {
    if (!can(user, "purchasing.approve")) throw new AppError("You don't have permission to approve purchase orders.");
    const res = await savePurchaseOrder(tx, actor, input);
    await approvePurchaseOrder(tx, actor, { id: res.id });
    return res;
  }
);

export const approvePurchaseOrderAction = action({ permission: "purchasing.approve", schema: idSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  approvePurchaseOrder(tx, actor, input)
);

export const markPurchaseOrderSentAction = action(
  { permission: ["purchasing.create", "purchasing.approve"], schema: idSchema, revalidate: PURCHASING_PATHS },
  async (input, { tx, actor }) => markPurchaseOrderSent(tx, actor, input)
);

export const cancelPurchaseOrderAction = action({ permission: "purchasing.approve", schema: idSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  cancelPurchaseOrder(tx, actor, input)
);

export const closePurchaseOrderAction = action({ permission: "purchasing.approve", schema: idSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  closePurchaseOrder(tx, actor, input)
);

export const deletePurchaseOrderAction = action({ permission: "purchasing.create", schema: idSchema, revalidate: PURCHASING_PATHS }, async (input, { tx, actor }) =>
  deletePurchaseOrder(tx, actor, input)
);
