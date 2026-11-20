import "server-only";
import { db } from "@/db";
import * as core from "./admin-core";

export type { AuditFilter, AuditRow, RoleRow, SeriesRow, UserRow } from "./admin-core";

export const listUsers = () => core.listUsers(db);
export const listRoles = () => core.listRoles(db);
export const listNumberSeries = () => core.listNumberSeries(db);
export const auditLog = (f: core.AuditFilter = {}) => core.auditLog(db, f);
export const auditFilterOptions = () => core.auditFilterOptions(db);
export const profileInfo = (userId: string) => core.profileInfo(db, userId);
