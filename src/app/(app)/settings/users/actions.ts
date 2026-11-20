"use server";

import { z } from "zod";
import { action } from "@/server/action";
import { hashPassword } from "@/server/auth";
import {
  assertCanManageAdmin,
  createRole,
  createUser,
  createUserSchema,
  deleteRole,
  resetPasswordSchema,
  resetUserPassword,
  roleSchema,
  updateRole,
  updateUser,
  updateUserSchema,
} from "@/server/services/admin";

const opts = { permission: "settings.users" as const, revalidate: ["/settings/users"] };

export const addUser = action({ ...opts, schema: createUserSchema }, async ({ password, ...input }, { tx, actor, user }) => {
  await assertCanManageAdmin(tx, user.permissions, { roleId: input.roleId });
  return createUser(tx, actor, { ...input, passwordHash: await hashPassword(password) });
});

export const editUser = action({ ...opts, schema: updateUserSchema }, async (input, { tx, actor, user }) => {
  await assertCanManageAdmin(tx, user.permissions, { roleId: input.roleId, userId: input.id });
  return updateUser(tx, actor, input);
});

export const resetPassword = action({ ...opts, schema: resetPasswordSchema }, async (input, { tx, actor, user }) => {
  await assertCanManageAdmin(tx, user.permissions, { userId: input.id });
  return resetUserPassword(tx, actor, { id: input.id, passwordHash: await hashPassword(input.password) });
});

export const saveRole = action({ ...opts, schema: roleSchema }, async (input, { tx, actor }) => (input.id ? updateRole(tx, actor, input) : createRole(tx, actor, input)));

export const removeRole = action({ ...opts, schema: z.object({ id: z.string().min(1) }) }, async (input, { tx, actor }) => deleteRole(tx, actor, input.id));
