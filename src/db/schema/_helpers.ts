import { numeric, text, timestamp } from "drizzle-orm/pg-core";

export const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// Money is stored as numeric(16,2) and quantities as numeric(16,3); both read back as JS numbers.
export const money = (name: string) => numeric(name, { precision: 16, scale: 2, mode: "number" });
export const qty = (name: string) => numeric(name, { precision: 16, scale: 3, mode: "number" });

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// Business dates (invoice date, attendance day...) are calendar days, stored as YYYY-MM-DD text
// so they never shift with time zones.
export const day = (name: string) => text(name);
