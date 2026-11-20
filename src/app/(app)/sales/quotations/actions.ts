"use server";
import { z } from "zod";
import { hasPermission } from "@/lib/permissions";
import { action } from "@/server/action";
import { convertQuotation, deleteQuotation, saveQuotation, setQuotationStatus } from "@/server/services/sales-quotations";
import { zQuotation } from "@/server/services/sales-schemas";

export const saveQuotationAction = action({ permission: "sales.create", schema: zQuotation, revalidate: ["/sales"] }, async (input, { tx, actor, user }) =>
  saveQuotation(tx, actor, input, { allowBelowMin: hasPermission(user.permissions, "sales.discount") })
);

export const setQuotationStatusAction = action(
  {
    permission: "sales.create",
    schema: z.object({ id: z.string().min(1), status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]) }),
    revalidate: ["/sales"],
  },
  async (input, { tx, actor }) => setQuotationStatus(tx, actor, input.id, input.status)
);

export const convertQuotationAction = action(
  { permission: "sales.create", schema: z.object({ id: z.string().min(1), target: z.enum(["order", "invoice"]) }), revalidate: ["/sales"] },
  async (input, { tx, actor, user }) => convertQuotation(tx, actor, input.id, input.target, { allowBelowMin: hasPermission(user.permissions, "sales.discount") })
);

export const deleteQuotationAction = action({ permission: "sales.create", schema: z.object({ id: z.string().min(1) }), revalidate: ["/sales"] }, async (input, { tx, actor }) =>
  deleteQuotation(tx, actor, input.id)
);
