"use server";
import { z } from "zod";
import { action } from "@/server/action";
import { supplierSchema } from "@/server/services/purchasing-schemas";
import { createSupplier, setSupplierActive, updateSupplier } from "@/server/services/suppliers";

const paths = ["/purchasing", "/accounting", "/"];

export const saveSupplier = action({ permission: "parties.manage", schema: supplierSchema, revalidate: paths }, async (input, { tx, actor }) =>
  input.id ? updateSupplier(tx, actor, input) : createSupplier(tx, actor, input)
);

export const toggleSupplierActive = action(
  { permission: "parties.manage", schema: z.object({ id: z.string().min(1), isActive: z.boolean() }), revalidate: paths },
  async (input, { tx, actor }) => setSupplierActive(tx, actor, input)
);
