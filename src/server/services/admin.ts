// Administration: company profile, document numbering, lock date, users and roles.
// No "server-only": scripts/tests call these with their own db. Passwords arrive already hashed
// (actions hash with hashPassword from src/server/auth.ts) so this file stays free of next/* imports.
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { company, numberSeries, roles, sessions, users } from "@/db/schema";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { AppError } from "../errors";
import { logAudit, type Actor } from "./audit";
import { SERIES, type SeriesKey } from "./numbering";

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

// ---- Company ----------------------------------------------------------------------------------

export const companySchema = z.object({
  name: z.string().trim().min(1, "Enter the company name").max(120),
  legalName: optionalText,
  tagline: optionalText,
  address: optionalText,
  city: optionalText,
  country: optionalText,
  phone: optionalText,
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email"),
  website: optionalText,
  taxNumber: optionalText,
  currency: z.string().trim().min(1, "Enter a currency code").max(8).toUpperCase(),
  currencySymbol: z.string().trim().min(1, "Enter a currency symbol").max(8),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  invoiceFooter: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  logoUrl: optionalText.refine((v) => !v || /^(https?:\/\/|\/)/.test(v), "Use a full https:// link or a /path"),
});
export type CompanyInput = z.input<typeof companySchema>;

export async function updateCompany(db: DbOrTx, actor: Actor | null, raw: CompanyInput) {
  const input = companySchema.parse(raw);
  const [existing] = await db.select().from(company).where(eq(company.id, "default"));
  if (existing) await db.update(company).set(input).where(eq(company.id, "default"));
  else await db.insert(company).values({ id: "default", ...input });
  await logAudit(db, actor, { action: "update", entity: "company", entityId: "default", summary: `Updated company profile (${input.name})`, data: input });
  return { id: "default" };
}

// ---- Numbering --------------------------------------------------------------------------------

export const seriesSchema = z.object({
  key: z.string().min(1),
  label: z.string().trim().min(1, "Enter a label").max(60).optional(),
  prefix: z.string().max(20, "Keep the prefix under 20 characters").regex(/^[^\s]*$/, "No spaces in the prefix"),
  nextNumber: z.coerce.number().int("Whole numbers only").min(1, "Start at 1 or more").max(999_999_999),
  padding: z.coerce.number().int().min(1, "At least 1 digit").max(10, "At most 10 digits"),
});
export type SeriesInput = z.input<typeof seriesSchema>;

export async function updateNumberSeries(db: DbOrTx, actor: Actor | null, raw: SeriesInput) {
  const input = seriesSchema.parse(raw);
  const def = SERIES[input.key as SeriesKey];
  const [current] = await db.select().from(numberSeries).where(eq(numberSeries.key, input.key));
  if (!current && !def) throw new AppError("Unknown document series");
  // Going backwards with the same prefix would hand out numbers that already exist
  if (current && input.prefix === current.prefix && input.nextNumber < current.nextNumber) {
    throw new AppError(
      `Numbers up to ${current.prefix}${String(current.nextNumber - 1).padStart(current.padding, "0")} may already be used. Choose ${current.nextNumber} or higher, or change the prefix.`,
      { nextNumber: `Use ${current.nextNumber} or higher` }
    );
  }
  const label = input.label ?? current?.label ?? def.label;
  if (current) {
    await db.update(numberSeries).set({ label, prefix: input.prefix, nextNumber: input.nextNumber, padding: input.padding }).where(eq(numberSeries.key, input.key));
  } else {
    await db.insert(numberSeries).values({ key: input.key, label, prefix: input.prefix, nextNumber: input.nextNumber, padding: input.padding });
  }
  const preview = `${input.prefix}${String(input.nextNumber).padStart(input.padding, "0")}`;
  await logAudit(db, actor, {
    action: "update",
    entity: "number_series",
    entityId: input.key,
    summary: `Numbering for ${label}: next is ${preview}`,
    data: { before: current ?? null, after: { label, prefix: input.prefix, nextNumber: input.nextNumber, padding: input.padding } },
  });
  return { key: input.key, preview };
}

// ---- Lock date --------------------------------------------------------------------------------

export const lockDateSchema = z.object({ lockDate: day.nullable() });

export async function setLockDate(db: DbOrTx, actor: Actor | null, raw: z.input<typeof lockDateSchema>) {
  const { lockDate } = lockDateSchema.parse(raw);
  const [c] = await db.select({ lockDate: company.lockDate }).from(company).where(eq(company.id, "default"));
  if (!c) await db.insert(company).values({ id: "default", lockDate });
  else await db.update(company).set({ lockDate }).where(eq(company.id, "default"));
  await logAudit(db, actor, {
    action: lockDate ? "lock" : "unlock",
    entity: "company",
    entityId: "default",
    summary: lockDate ? `Closed the books up to ${lockDate}` : `Reopened the books (was closed up to ${c?.lockDate ?? "—"})`,
    data: { before: c?.lockDate ?? null, after: lockDate },
  });
  return { lockDate };
}

// ---- Users ------------------------------------------------------------------------------------

const email = z.string().trim().toLowerCase().email("Enter a valid email");

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  email,
  roleId: z.string().min(1, "Choose a role"),
  password: z.string().min(8, "Use at least 8 characters"),
  isActive: z.boolean().default(true),
});
export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Enter a name").max(120),
  email: email.optional(),
  roleId: z.string().min(1, "Choose a role"),
  isActive: z.boolean(),
});
export const resetPasswordSchema = z.object({ id: z.string().min(1), password: z.string().min(8, "Use at least 8 characters") });

async function roleById(db: DbOrTx, id: string) {
  const [r] = await db.select().from(roles).where(eq(roles.id, id));
  if (!r) throw new AppError("Role not found", { roleId: "Choose a role" });
  return r;
}

/** Active users holding the full-access ("*") role, optionally ignoring one user. */
async function activeAdminCount(db: DbOrTx, exceptUserId?: string) {
  const res = await db
    .select({ c: sql<number>`count(*)`.mapWith(Number) })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(users.isActive, true), sql`${roles.permissions} @> '["*"]'::jsonb`, exceptUserId ? ne(users.id, exceptUserId) : undefined));
  return res[0]?.c ?? 0;
}

export async function createUser(
  db: DbOrTx,
  actor: Actor | null,
  input: Omit<z.input<typeof createUserSchema>, "password"> & { passwordHash: string }
) {
  const parsed = createUserSchema.omit({ password: true }).parse(input);
  const role = await roleById(db, parsed.roleId);
  const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.email));
  if (dupe) throw new AppError("A user with this email already exists", { email: "Already in use" });
  const [u] = await db
    .insert(users)
    .values({ name: parsed.name, email: parsed.email, roleId: role.id, isActive: parsed.isActive, passwordHash: input.passwordHash })
    .returning({ id: users.id });
  await logAudit(db, actor, { action: "create", entity: "user", entityId: u.id, summary: `Created user ${parsed.name} (${parsed.email}) as ${role.name}` });
  return { id: u.id };
}

export async function updateUser(db: DbOrTx, actor: Actor | null, raw: z.input<typeof updateUserSchema>) {
  const input = updateUserSchema.parse(raw);
  const [user] = await db.select().from(users).where(eq(users.id, input.id));
  if (!user) throw new AppError("User not found");
  const [oldRole] = await db.select().from(roles).where(eq(roles.id, user.roleId));
  const newRole = await roleById(db, input.roleId);

  if (actor?.id === user.id && !input.isActive) throw new AppError("You can't deactivate your own account.");

  const wasAdmin = user.isActive && !!oldRole?.permissions.includes("*");
  const staysAdmin = input.isActive && newRole.permissions.includes("*");
  if (wasAdmin && !staysAdmin && (await activeAdminCount(db, user.id)) === 0) {
    throw new AppError("This is the last active Administrator. Make someone else an Administrator first.");
  }
  if (input.email && input.email !== user.email) {
    const [dupe] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, input.email), ne(users.id, user.id)));
    if (dupe) throw new AppError("A user with this email already exists", { email: "Already in use" });
  }

  await db
    .update(users)
    .set({ name: input.name, email: input.email ?? user.email, roleId: newRole.id, isActive: input.isActive })
    .where(eq(users.id, user.id));
  // A disabled account is signed out everywhere straight away
  if (!input.isActive && user.isActive) await db.delete(sessions).where(eq(sessions.userId, user.id));

  const changes: string[] = [];
  if (input.name !== user.name) changes.push(`name → ${input.name}`);
  if (input.email && input.email !== user.email) changes.push(`email → ${input.email}`);
  if (newRole.id !== user.roleId) changes.push(`role ${oldRole?.name ?? "?"} → ${newRole.name}`);
  if (input.isActive !== user.isActive) changes.push(input.isActive ? "activated" : "deactivated");
  await logAudit(db, actor, {
    action: "update",
    entity: "user",
    entityId: user.id,
    summary: `Updated user ${input.name}${changes.length ? `: ${changes.join(", ")}` : ""}`,
  });
  return { id: user.id };
}

export async function resetUserPassword(db: DbOrTx, actor: Actor | null, input: { id: string; passwordHash: string }) {
  const [user] = await db.select().from(users).where(eq(users.id, input.id));
  if (!user) throw new AppError("User not found");
  await db.update(users).set({ passwordHash: input.passwordHash }).where(eq(users.id, user.id));
  // Old sessions stop working once an admin sets a new password (except the admin's own current one)
  if (actor?.id !== user.id) await db.delete(sessions).where(eq(sessions.userId, user.id));
  await logAudit(db, actor, { action: "update", entity: "user", entityId: user.id, summary: `Reset password for ${user.name}` });
  return { id: user.id };
}

/** Delete every session of a user (sign out on all devices). Returns how many were removed. */
export async function deleteUserSessions(db: DbOrTx, actor: Actor | null, userId: string) {
  const removed = await db.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
  await logAudit(db, actor, { action: "logout", entity: "user", entityId: userId, summary: `Signed out of all devices (${removed.length} session${removed.length === 1 ? "" : "s"})` });
  return { removed: removed.length };
}

// ---- Roles ------------------------------------------------------------------------------------

const permissionList = z
  .array(z.string())
  .transform((list) => [...new Set(list)])
  .refine((list) => list.every((p) => (ALL_PERMISSIONS as string[]).includes(p)), "Unknown permission in the list");

export const roleSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(1, "Enter a role name").max(60),
  description: optionalText,
  permissions: permissionList,
});
export type RoleInput = z.input<typeof roleSchema>;

async function assertRoleNameFree(db: DbOrTx, name: string, exceptId?: string) {
  const [dupe] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(sql`lower(${roles.name}) = lower(${name})`, exceptId ? ne(roles.id, exceptId) : undefined));
  if (dupe) throw new AppError("A role with this name already exists", { name: "Already in use" });
}

export async function createRole(db: DbOrTx, actor: Actor | null, raw: RoleInput) {
  const input = roleSchema.parse(raw);
  await assertRoleNameFree(db, input.name);
  const [r] = await db.insert(roles).values({ name: input.name, description: input.description, permissions: input.permissions }).returning({ id: roles.id });
  await logAudit(db, actor, {
    action: "create",
    entity: "role",
    entityId: r.id,
    summary: `Created role ${input.name} with ${input.permissions.length} permission${input.permissions.length === 1 ? "" : "s"}`,
    data: { permissions: input.permissions },
  });
  return { id: r.id };
}

export async function updateRole(db: DbOrTx, actor: Actor | null, raw: RoleInput) {
  const input = roleSchema.parse(raw);
  if (!input.id) throw new AppError("Role not found");
  const role = await roleById(db, input.id);
  if (role.permissions.includes("*")) throw new AppError("The Administrator role has full access and can't be changed.");
  await assertRoleNameFree(db, input.name, role.id);
  await db.update(roles).set({ name: input.name, description: input.description, permissions: input.permissions }).where(eq(roles.id, role.id));
  const added = input.permissions.filter((p) => !role.permissions.includes(p));
  const removed = role.permissions.filter((p) => !input.permissions.includes(p));
  await logAudit(db, actor, {
    action: "update",
    entity: "role",
    entityId: role.id,
    summary: `Updated role ${input.name}${role.name !== input.name ? ` (renamed from ${role.name})` : ""}: +${added.length} / −${removed.length} permissions`,
    data: { added, removed },
  });
  return { id: role.id };
}

export async function deleteRole(db: DbOrTx, actor: Actor | null, id: string) {
  const role = await roleById(db, id);
  if (role.permissions.includes("*") || role.isSystem) throw new AppError(`${role.name} is a built-in role and can't be deleted.`);
  const [{ c }] = await db.select({ c: sql<number>`count(*)`.mapWith(Number) }).from(users).where(eq(users.roleId, id));
  if (c > 0) throw new AppError(`${c} user${c === 1 ? " has" : "s have"} this role. Move them to another role first.`);
  await db.delete(roles).where(eq(roles.id, id));
  await logAudit(db, actor, { action: "delete", entity: "role", entityId: id, summary: `Deleted role ${role.name}` });
  return { id };
}

/**
 * Only an Administrator may hand out the Administrator role, or change / reset an Administrator's
 * account; otherwise anyone with "Manage users" could promote themselves to full access.
 */
export async function assertCanManageAdmin(db: DbOrTx, actorPermissions: readonly string[], target: { roleId?: string; userId?: string }) {
  if (actorPermissions.includes("*")) return;
  if (target.roleId) {
    const role = await roleById(db, target.roleId);
    if (role.permissions.includes("*")) throw new AppError("Only an Administrator can give someone the Administrator role.", { roleId: "Not allowed" });
  }
  if (target.userId) {
    const [row] = await db.select({ permissions: roles.permissions }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, target.userId));
    if (row?.permissions.includes("*")) throw new AppError("Only an Administrator can change an Administrator's account.");
  }
}
