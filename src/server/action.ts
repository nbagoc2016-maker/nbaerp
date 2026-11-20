import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError, type z } from "zod";
import { db, type Tx } from "@/db";
import type { Permission } from "@/lib/permissions";
import { authorize, type CurrentUser } from "./auth";
import { AppError } from "./errors";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

interface ActionContext {
  user: CurrentUser;
  /** Runs inside one database transaction: everything commits together or not at all */
  tx: Tx;
  actor: { id: string; name: string };
}

/**
 * Wraps a server action: checks the session and permission, validates input with zod, runs the
 * handler in a transaction, revalidates paths, and turns errors into a result the UI can show.
 *
 *   export const createThing = action({ permission: "x.create", schema, revalidate: ["/things"] },
 *     async (input, { tx, actor }) => { ... return { id } })
 */
export function action<S extends z.ZodTypeAny, T>(
  opts: { permission?: Permission | Permission[]; schema: S; revalidate?: string[] },
  handler: (input: z.infer<S>, ctx: ActionContext) => Promise<T>
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const user = await authorize(opts.permission);
      const input = opts.schema.parse(raw);
      const data = await db.transaction((tx) => handler(input, { user, tx, actor: { id: user.id, name: user.name } }));
      for (const p of opts.revalidate ?? []) revalidatePath(p, "layout");
      return { ok: true, data };
    } catch (err) {
      return toActionError(err);
    }
  };
}

export function toActionError(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    const first = err.issues[0];
    return { ok: false, error: first ? `${first.path.join(".") || "Input"}: ${first.message}` : "Invalid input", fieldErrors };
  }
  const message = err instanceof Error ? err.message : String(err);
  // Unique-constraint violations are the most common database error users can fix themselves
  if (/duplicate key|unique constraint/i.test(message)) {
    return { ok: false, error: "A record with the same code or name already exists." };
  }
  console.error("[action error]", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}
