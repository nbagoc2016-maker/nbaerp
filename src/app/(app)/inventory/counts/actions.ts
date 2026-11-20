"use server";

import { action } from "@/server/action";
import { createCount, postCount, saveCountLines, voidCount } from "@/server/services/inventory";
import { countCreateSchema, countLinesSchema, voidSchema } from "@/server/services/inventory-schemas";

const revalidate = ["/inventory"];

export const createCountAction = action({ permission: "inventory.adjust", schema: countCreateSchema, revalidate }, async (input, { tx, actor }) =>
  createCount(tx, actor, input)
);

export const saveCountLinesAction = action({ permission: "inventory.adjust", schema: countLinesSchema, revalidate }, async (input, { tx, actor }) =>
  saveCountLines(tx, actor, input)
);

/** Saves the latest counted quantities, then posts the differences */
export const postCountAction = action({ permission: "inventory.adjust", schema: countLinesSchema, revalidate }, async (input, { tx, actor }) => {
  await saveCountLines(tx, actor, input);
  return postCount(tx, actor, input.id);
});

export const voidCountAction = action({ permission: "inventory.adjust", schema: voidSchema, revalidate }, async (input, { tx, actor }) =>
  voidCount(tx, actor, input.id, input.reason)
);
