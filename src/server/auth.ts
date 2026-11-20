import "server-only";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/db";
import { roles, sessions, users } from "@/db/schema";
import { hasPermission, type Permission } from "@/lib/permissions";
import { AppError } from "./errors";

export const SESSION_COOKIE = "sv4_session";
const SESSION_DAYS = 14;

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  // Only a hash of the token is stored, so a leaked database can't be used to log in
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  store.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      roleId: roles.id,
      roleName: roles.name,
      permissions: roles.permissions,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())));
  if (!row || !row.isActive) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    roleId: row.roleId,
    roleName: row.roleName,
    permissions: row.permissions,
  };
});

/** For pages: signed-in user or redirect to login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: user holding the permission, otherwise the "no access" page. */
export async function requirePermission(permission: Permission | Permission[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user.permissions, permission)) redirect("/forbidden");
  return user;
}

/** For server actions: throws a user-facing error instead of redirecting. */
export async function authorize(permission?: Permission | Permission[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("Your session has expired. Please sign in again.");
  if (permission && !hasPermission(user.permissions, permission)) {
    throw new AppError("You don't have permission to do this.");
  }
  return user;
}

export const can = (user: CurrentUser, permission: Permission | Permission[]) => hasPermission(user.permissions, permission);
