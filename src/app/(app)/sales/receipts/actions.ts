"use server";
import { z } from "zod";
import { action } from "@/server/action";
import { createReceipt, voidReceipt } from "@/server/services/sales-receipts";
import { zReceipt } from "@/server/services/sales-schemas";

export const createReceiptAction = action({ permission: "sales.receipts", schema: zReceipt, revalidate: ["/"] }, async (input, { tx, actor }) =>
  createReceipt(tx, actor, input)
);

export const voidReceiptAction = action(
  { permission: "sales.void", schema: z.object({ id: z.string().min(1), reason: z.string().trim().optional() }), revalidate: ["/"] },
  async (input, { tx, actor }) => voidReceipt(tx, actor, input.id, input.reason || null)
);
