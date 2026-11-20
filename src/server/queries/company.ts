import "server-only";
import { cache } from "react";
import { db } from "@/db";
import { company } from "@/db/schema";

/** Company profile for headers, invoices and currency display. Cached per request. */
export const getCompany = cache(async () => {
  const [row] = await db.select().from(company).limit(1);
  return (
    row ?? {
      id: "default",
      name: "My Company",
      currency: "PKR",
      currencySymbol: "Rs",
      fiscalYearStartMonth: 7,
    } as typeof company.$inferSelect
  );
});
