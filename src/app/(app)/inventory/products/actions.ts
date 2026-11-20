"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { products } from "@/db/schema";
import { hasPermission } from "@/lib/permissions";
import { action } from "@/server/action";
import { idSchema, productImportSchema, productSchema } from "@/server/services/inventory-schemas";
import { createProduct, importProducts, setProductActive, updateProduct } from "@/server/services/products";

const revalidate = ["/inventory"];

export const saveProductAction = action({ permission: "inventory.manage", schema: productSchema, revalidate }, async (input, { tx, actor, user }) => {
  // Without cost access the form hides cost fields: keep the stored cost and skip opening stock
  if (!hasPermission(user.permissions, "inventory.cost")) {
    let costPrice = 0;
    if (input.id) {
      const [p] = await tx.select({ costPrice: products.costPrice }).from(products).where(eq(products.id, input.id));
      costPrice = p?.costPrice ?? 0;
    }
    input = { ...input, costPrice, opening: [] };
  }
  return input.id ? updateProduct(tx, actor, input) : createProduct(tx, actor, input);
});

export const setProductActiveAction = action(
  { permission: "inventory.manage", schema: idSchema.extend({ isActive: z.boolean() }), revalidate },
  async (input, { tx, actor }) => setProductActive(tx, actor, input.id, input.isActive)
);

export const importProductsAction = action(
  { permission: ["inventory.manage"], schema: productImportSchema, revalidate },
  async (input, { tx, actor, user }) => {
    // Opening quantities carry a cost, so they need cost access
    const rows = hasPermission(user.permissions, "inventory.cost") ? input.rows : input.rows.map((r) => ({ ...r, openingQty: 0 }));
    return importProducts(tx, actor, { ...input, rows });
  }
);
