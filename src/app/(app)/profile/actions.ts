"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { action } from "@/server/action";
import { SESSION_COOKIE } from "@/server/auth";
import { deleteUserSessions } from "@/server/services/admin";

/** Sign out on every device, including this one. */
export const signOutEverywhere = action({ schema: z.object({}) }, async (_input, { tx, user, actor }) => {
  const res = await deleteUserSessions(tx, actor, user.id);
  (await cookies()).delete(SESSION_COOKIE);
  return res;
});
