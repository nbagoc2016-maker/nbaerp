"use server";

import { action } from "@/server/action";
import { createExpense, voidExpense } from "@/server/services/finance-expenses";
import { expenseSchema, voidSchema } from "@/server/services/finance-shared";

export const saveExpense = action(
  { permission: "accounting.expenses", schema: expenseSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => createExpense(tx, actor, input)
);

export const voidExpenseEntry = action(
  { permission: "accounting.expenses", schema: voidSchema, revalidate: ["/accounting"] },
  async (input, { tx, actor }) => voidExpense(tx, actor, input)
);
