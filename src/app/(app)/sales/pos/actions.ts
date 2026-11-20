"use server";
import { hasPermission } from "@/lib/permissions";
import { action } from "@/server/action";
import { completePosSale } from "@/server/services/sales-pos";
import { zPosSale } from "@/server/services/sales-schemas";

export const completePosSaleAction = action({ permission: "sales.pos", schema: zPosSale, revalidate: ["/"] }, async (input, { tx, actor, user }) =>
  completePosSale(tx, actor, input, { allowBelowMin: hasPermission(user.permissions, "sales.discount") })
);
