import "server-only";
import { db } from "@/db";
import { today } from "@/lib/format";
import { getDashboard as getDashboardCore, type DashboardAccess } from "./reports-dashboard";

export type { DashboardAccess, DashboardData } from "./reports-dashboard";

/** Dashboard figures for today against the app database. */
export const getDashboard = (access: DashboardAccess) => getDashboardCore(db, { today: today(), access });
