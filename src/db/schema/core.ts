import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_helpers";

// Single-company setup: one row with id "default"
export const company = pgTable("company", {
  id: text("id").primaryKey().default("default"),
  name: text("name").notNull().default("My Company"),
  legalName: text("legal_name"),
  tagline: text("tagline"),
  address: text("address"),
  city: text("city"),
  country: text("country").default("Pakistan"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  taxNumber: text("tax_number"),
  currency: text("currency").notNull().default("PKR"),
  currencySymbol: text("currency_symbol").notNull().default("Rs"),
  logoUrl: text("logo_url"),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(7),
  // Journals dated on or before this day can no longer be posted or changed
  lockDate: text("lock_date"),
  invoiceFooter: text("invoice_footer"),
  updatedAt: updatedAt(),
});

export const roles = pgTable("roles", {
  id: id(),
  name: text("name").notNull().unique(),
  description: text("description"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // random token, also the cookie value (hashed)
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    action: text("action").notNull(), // create | update | delete | post | void | login ...
    entity: text("entity").notNull(), // e.g. sales_invoice
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)]
);

// Document numbering: key "SI" -> SI-000123
export const numberSeries = pgTable("number_series", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  padding: integer("padding").notNull().default(5),
});

export const notifications = pgTable("notifications", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  href: text("href"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: createdAt(),
});
