import "server-only";
import { db } from "@/db";
import type { DbOrTx } from "@/db/client";
import * as core from "./reports-core";

// App-database bindings of the report queries in ./reports-core (tests call those with their own db).
type Rest<F> = F extends (db: DbOrTx, ...args: infer A) => unknown ? A : never;

export const salesSummary = (...a: Rest<typeof core.salesSummary>) => core.salesSummary(db, ...a);
export const salesByProduct = (...a: Rest<typeof core.salesByProduct>) => core.salesByProduct(db, ...a);
export const salesByCustomer = (...a: Rest<typeof core.salesByCustomer>) => core.salesByCustomer(db, ...a);
export const salesByCategory = (...a: Rest<typeof core.salesByCategory>) => core.salesByCategory(db, ...a);
export const salesBySalesperson = (...a: Rest<typeof core.salesBySalesperson>) => core.salesBySalesperson(db, ...a);
export const purchasesBySupplier = (...a: Rest<typeof core.purchasesBySupplier>) => core.purchasesBySupplier(db, ...a);
export const purchasesByProduct = (...a: Rest<typeof core.purchasesByProduct>) => core.purchasesByProduct(db, ...a);
export const inventoryValuation = (...a: Rest<typeof core.inventoryValuation>) => core.inventoryValuation(db, ...a);
export const reorderReport = (...a: Rest<typeof core.reorderReport>) => core.reorderReport(db, ...a);
export const stockMovementSummary = (...a: Rest<typeof core.stockMovementSummary>) => core.stockMovementSummary(db, ...a);
export const agedReceivables = (...a: Rest<typeof core.agedReceivables>) => core.agedReceivables(db, ...a);
export const agedPayables = (...a: Rest<typeof core.agedPayables>) => core.agedPayables(db, ...a);
export const taxSummary = (...a: Rest<typeof core.taxSummary>) => core.taxSummary(db, ...a);
export const expenseByCategory = (...a: Rest<typeof core.expenseByCategory>) => core.expenseByCategory(db, ...a);
export const dailyCash = (...a: Rest<typeof core.dailyCash>) => core.dailyCash(db, ...a);
export const payrollSummary = (...a: Rest<typeof core.payrollSummary>) => core.payrollSummary(db, ...a);
export const cashAccounts = (...a: Rest<typeof core.cashAccounts>) => core.cashAccounts(db, ...a);
