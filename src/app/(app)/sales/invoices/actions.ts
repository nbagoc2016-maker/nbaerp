"use server";
import { z } from "zod";
import { hasPermission } from "@/lib/permissions";
import { action } from "@/server/action";
import { AppError } from "@/server/errors";
import { deleteDraftInvoice, postInvoice, saveInvoice } from "@/server/services/sales";
import { voidSale } from "@/server/services/sales-pos";
import { zInvoice } from "@/server/services/sales-schemas";

const zIdOnly = z.object({ id: z.string().min(1) });

export const saveInvoiceAction = action({ permission: "sales.create", schema: zInvoice, revalidate: ["/"] }, async (input, { tx, actor, user }) => {
  if (input.post && !hasPermission(user.permissions, "sales.post")) throw new AppError("You can save drafts but not post invoices.");
  return saveInvoice(tx, actor, input, { allowBelowMin: hasPermission(user.permissions, "sales.discount") });
});

export const postInvoiceAction = action({ permission: "sales.post", schema: zIdOnly, revalidate: ["/"] }, async (input, { tx, actor, user }) =>
  postInvoice(tx, actor, input.id, { allowBelowMin: hasPermission(user.permissions, "sales.discount") })
);

export const voidInvoiceAction = action(
  { permission: "sales.void", schema: z.object({ id: z.string().min(1), reason: z.string().trim().optional() }), revalidate: ["/"] },
  async (input, { tx, actor }) => voidSale(tx, actor, input.id, input.reason || null)
);

export const deleteInvoiceAction = action({ permission: "sales.create", schema: zIdOnly, revalidate: ["/sales"] }, async (input, { tx, actor }) =>
  deleteDraftInvoice(tx, actor, input.id)
);
