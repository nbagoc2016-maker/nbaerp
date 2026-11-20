import "server-only";
import { can, type CurrentUser } from "@/server/auth";
import { AppError } from "@/server/errors";

// Paths whose data changes when a purchasing document is saved, posted or voided
export const PURCHASING_PATHS = ["/purchasing", "/inventory", "/accounting", "/reports", "/"];

/** "Save & post" needs the create permission as well as post. */
export function assertCanCreate(user: CurrentUser) {
  if (!can(user, "purchasing.create")) throw new AppError("You don't have permission to do this.");
}
