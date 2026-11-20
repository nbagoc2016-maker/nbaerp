// Administration read queries (users, roles, numbering, audit log). Take a db handle so tests can
// call them; pages use ./admin.ts (server-only).
import { and, asc, desc, eq, gt, gte, lte, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { auditLogs, numberSeries, roles, sessions, users } from "@/db/schema";
import { SERIES, type SeriesKey } from "../services/numbering";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  isAdmin: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export async function listUsers(db: DbOrTx): Promise<UserRow[]> {
  const data = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      roleId: users.roleId,
      roleName: roles.name,
      permissions: roles.permissions,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .orderBy(asc(users.name));
  return data.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    roleId: u.roleId,
    roleName: u.roleName,
    isAdmin: u.permissions.includes("*"),
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  isAdmin: boolean;
  userCount: number;
}

export async function listRoles(db: DbOrTx): Promise<RoleRow[]> {
  const data = await db
    .select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      permissions: roles.permissions,
      isSystem: roles.isSystem,
      userCount: sql<number>`(select count(*) from users u where u.role_id = roles.id)`.mapWith(Number),
    })
    .from(roles)
    .orderBy(asc(roles.createdAt), asc(roles.name));
  return data.map((r) => ({ ...r, isAdmin: r.permissions.includes("*") }));
}

export interface SeriesRow {
  key: string;
  label: string;
  prefix: string;
  nextNumber: number;
  padding: number;
  inUse: boolean; // a row exists, i.e. at least one number was issued or it was edited
}

/** Every document series, including ones not used yet (shown with their defaults). */
export async function listNumberSeries(db: DbOrTx): Promise<SeriesRow[]> {
  const stored = await db.select().from(numberSeries);
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const known = (Object.keys(SERIES) as SeriesKey[]).map((key) => {
    const s = byKey.get(key);
    return {
      key,
      label: s?.label ?? SERIES[key].label,
      prefix: s?.prefix ?? SERIES[key].prefix,
      nextNumber: s?.nextNumber ?? 1,
      padding: s?.padding ?? 5,
      inUse: !!s,
    };
  });
  const extra = stored.filter((s) => !(s.key in SERIES)).map((s) => ({ key: s.key, label: s.label, prefix: s.prefix, nextNumber: s.nextNumber, padding: s.padding, inUse: true }));
  return [...known, ...extra];
}

export const formatSeriesPreview = (prefix: string, next: number, padding: number) => `${prefix}${String(Math.max(next, 0)).padStart(Math.max(padding, 0), "0")}`;

export interface AuditFilter {
  from?: string; // YYYY-MM-DD (business day in the app time zone)
  to?: string;
  userId?: string;
  entity?: string;
  action?: string;
  limit?: number;
}

export interface AuditRow {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  data: unknown;
}

const TZ = process.env.NEXT_PUBLIC_APP_TZ ?? "Asia/Karachi";

export async function auditLog(db: DbOrTx, f: AuditFilter = {}): Promise<{ rows: AuditRow[]; limited: boolean }> {
  const where: SQL[] = [];
  // Compare on the business-day calendar so "today" means today in the app's time zone
  const localDay = sql`to_char(${auditLogs.createdAt} at time zone ${TZ}, 'YYYY-MM-DD')`;
  if (f.from) where.push(gte(localDay, f.from));
  if (f.to) where.push(lte(localDay, f.to));
  if (f.userId) where.push(eq(auditLogs.userId, f.userId));
  if (f.entity) where.push(eq(auditLogs.entity, f.entity));
  if (f.action) where.push(eq(auditLogs.action, f.action));
  const limit = f.limit ?? 1000;
  const data = await db
    .select()
    .from(auditLogs)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit + 1);
  return {
    limited: data.length > limit,
    rows: data.slice(0, limit).map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      userId: r.userId,
      userName: r.userName ?? "System",
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      summary: r.summary,
      data: r.data ?? null,
    })),
  };
}

export async function auditFilterOptions(db: DbOrTx) {
  const [entities, actions, people] = await Promise.all([
    db.selectDistinct({ v: auditLogs.entity }).from(auditLogs).orderBy(asc(auditLogs.entity)),
    db.selectDistinct({ v: auditLogs.action }).from(auditLogs).orderBy(asc(auditLogs.action)),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
  ]);
  return { entities: entities.map((e) => e.v), actions: actions.map((a) => a.v), users: people };
}

/** Sign-in details for the profile page. */
export async function profileInfo(db: DbOrTx, userId: string) {
  const [row] = await db.select({ lastLoginAt: users.lastLoginAt, createdAt: users.createdAt }).from(users).where(eq(users.id, userId));
  const [s] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())));
  return { lastLoginAt: row?.lastLoginAt?.toISOString() ?? null, createdAt: row?.createdAt?.toISOString() ?? null, activeSessions: s?.n ?? 0 };
}
