"use server";
import { z } from "zod";
import { hasPermission } from "@/lib/permissions";
import { action } from "@/server/action";
import { AppError } from "@/server/errors";
import { createReturn, postReturn, voidReturn } from "@/server/services/sales-returns";
import { zReturn } from "@/server/services/sales-schemas";

export const createReturnAction = action({ permission: "sales.create", schema: zReturn, revalidate: ["/"] }, async (input, { tx, actor, user }) => {
  if (input.post && !hasPermission(user.permissions, "sales.post")) throw new AppError("You can save the return as a draft but not post it.");
  return createReturn(tx, actor, input);
});

export const postReturnAction = action({ permission: "sales.post", schema: z.object({ id: z.string().min(1) }), revalidate: ["/"] }, async (input, { tx, actor }) =>
  postReturn(tx, actor, input.id)
);

export const voidReturnAction = action(
  { permission: "sales.void", schema: z.object({ id: z.string().min(1), reason: z.string().trim().optional() }), revalidate: ["/"] },
  async (input, { tx, actor }) => voidReturn(tx, actor, input.id, input.reason || null)
);
