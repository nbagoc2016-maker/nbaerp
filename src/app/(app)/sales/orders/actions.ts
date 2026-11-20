"use server";
import { z } from "zod";
import { hasPermission } from "@/lib/permissions";
import { action } from "@/server/action";
import { cancelOrder, confirmOrder, createInvoiceFromOrder, deleteDraftOrder, saveOrder } from "@/server/services/sales-orders";
import { zOrder, zOrderToInvoice } from "@/server/services/sales-schemas";

const zIdOnly = z.object({ id: z.string().min(1) });

export const saveOrderAction = action({ permission: "sales.create", schema: zOrder, revalidate: ["/sales"] }, async (input, { tx, actor, user }) =>
  saveOrder(tx, actor, input, { allowBelowMin: hasPermission(user.permissions, "sales.discount") })
);

export const confirmOrderAction = action({ permission: "sales.create", schema: zIdOnly, revalidate: ["/sales"] }, async (input, { tx, actor }) =>
  confirmOrder(tx, actor, input.id)
);

export const cancelOrderAction = action(
  { permission: "sales.void", schema: z.object({ id: z.string().min(1), reason: z.string().trim().optional() }), revalidate: ["/sales"] },
  async (input, { tx, actor }) => cancelOrder(tx, actor, input.id, input.reason || null)
);

export const deleteOrderAction = action({ permission: "sales.create", schema: zIdOnly, revalidate: ["/sales"] }, async (input, { tx, actor }) =>
  deleteDraftOrder(tx, actor, input.id)
);

export const invoiceFromOrderAction = action({ permission: "sales.create", schema: zOrderToInvoice, revalidate: ["/sales"] }, async (input, { tx, actor, user }) =>
  createInvoiceFromOrder(tx, actor, input, { allowBelowMin: hasPermission(user.permissions, "sales.discount") })
);
