"use server";
import { z } from "zod";
import { action } from "@/server/action";
import { createCustomer, setCustomerActive, updateCustomer } from "@/server/services/customers";
import { zCustomer } from "@/server/services/sales-schemas";

export const saveCustomer = action({ permission: "parties.manage", schema: zCustomer, revalidate: ["/"] }, async (input, { tx, actor }) => {
  if (input.id) return updateCustomer(tx, actor, { ...input, id: input.id });
  return createCustomer(tx, actor, input);
});

/** Quick add from the POS / invoice form: cashiers with POS access may add a customer on the spot. */
export const quickAddCustomer = action(
  {
    permission: ["parties.manage", "sales.pos"],
    schema: zCustomer.pick({ name: true, phone: true, city: true, type: true, priceLevel: true }),
    revalidate: ["/sales"],
  },
  async (input, { tx, actor }) =>
    createCustomer(tx, actor, {
      ...input,
      contactPerson: null,
      altPhone: null,
      email: null,
      address: null,
      taxNumber: null,
      cnic: null,
      paymentTermsDays: 0,
      creditLimit: 0,
      openingBalance: 0,
      openingDate: null,
      notes: null,
      isActive: true,
    })
);

export const toggleCustomerActive = action(
  { permission: "parties.manage", schema: z.object({ id: z.string().min(1), isActive: z.boolean() }), revalidate: ["/sales"] },
  async (input, { tx, actor }) => setCustomerActive(tx, actor, input.id, input.isActive)
);
