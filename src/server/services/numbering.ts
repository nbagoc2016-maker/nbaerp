import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { numberSeries } from "@/db/schema";

// Every numbered document type. Prefix is editable later in Settings.
export const SERIES = {
  JE: { label: "Journal Entry", prefix: "JV-" },
  SI: { label: "Sales Invoice", prefix: "INV-" },
  POS: { label: "POS Sale", prefix: "POS-" },
  QT: { label: "Quotation", prefix: "QT-" },
  SO: { label: "Sales Order", prefix: "SO-" },
  RCPT: { label: "Customer Receipt", prefix: "RCV-" },
  SR: { label: "Sales Return", prefix: "SRN-" },
  PO: { label: "Purchase Order", prefix: "PO-" },
  GRN: { label: "Goods Receipt", prefix: "GRN-" },
  BILL: { label: "Supplier Bill", prefix: "BILL-" },
  PAY: { label: "Supplier Payment", prefix: "PAY-" },
  PR: { label: "Purchase Return", prefix: "PRN-" },
  TRF: { label: "Stock Transfer", prefix: "TRF-" },
  ADJ: { label: "Stock Adjustment", prefix: "ADJ-" },
  CNT: { label: "Stock Count", prefix: "CNT-" },
  EXP: { label: "Expense", prefix: "EXP-" },
  PCV: { label: "Petty Cash Voucher", prefix: "PCV-" },
  BT: { label: "Bank Transfer", prefix: "BT-" },
  ADV: { label: "Employee Advance", prefix: "ADV-" },
  PRL: { label: "Payroll Run", prefix: "PRL-" },
  SAL: { label: "Salary Payment", prefix: "SAL-" },
  CUST: { label: "Customer Code", prefix: "C-" },
  SUPP: { label: "Supplier Code", prefix: "S-" },
  EMP: { label: "Employee Code", prefix: "E-" },
  SKU: { label: "Product SKU", prefix: "P-" },
} as const;

export type SeriesKey = keyof typeof SERIES;

/** Reserve the next document number, e.g. "INV-00042". Safe inside a transaction. */
export async function nextNumber(db: DbOrTx, key: SeriesKey): Promise<string> {
  const def = SERIES[key];
  // Insert the series on first use, then atomically take the current number and bump it
  await db
    .insert(numberSeries)
    .values({ key, label: def.label, prefix: def.prefix, nextNumber: 1, padding: 5 })
    .onConflictDoNothing();
  const result = (await db.execute<{ prefix: string; n: number; padding: number }>(
    sql`update number_series set next_number = next_number + 1 where key = ${key}
        returning prefix, next_number - 1 as n, padding`
  )) as unknown as { prefix: string; n: number; padding: number }[] | { rows: { prefix: string; n: number; padding: number }[] };
  const row = Array.isArray(result) ? result[0] : result.rows[0];
  return `${row.prefix}${String(row.n).padStart(row.padding, "0")}`;
}
