import { asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  bom,
  bomLines,
  products,
  warehouses,
  workOrderLines,
  workOrders,
} from "@/db/schema";
import { round2, round3, today } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal } from "./accounting";
import type { Actor } from "./audit";
import { logAudit } from "./audit";
import { ACC } from "./chart-of-accounts";
import { nextNumber } from "./numbering";
import { moveStock } from "./stock";

// ---- BOM Service -------------------------------------------------------------------------------

export interface BomLineInput {
  productId: string;
  qty: number;
  scrapPct?: number;
  notes?: string | null;
}

export interface SaveBomInput {
  id?: string;
  name: string;
  productId: string;
  outputQty?: number;
  laborCost?: number;
  overheadCost?: number;
  notes?: string | null;
  isActive?: boolean;
  lines: BomLineInput[];
}

export async function saveBom(db: DbOrTx, actor: Actor | null, input: SaveBomInput) {
  const [product] = await db.select().from(products).where(eq(products.id, input.productId));
  if (!product) throw new AppError("Finished good product not found");
  if (product.type !== "stock") throw new AppError("BOM output product must be a stockable product");

  if (!input.lines || input.lines.length === 0) {
    throw new AppError("BOM must contain at least one component (raw material)");
  }

  let id = input.id;
  let number: string;

  if (id) {
    const [existing] = await db.select().from(bom).where(eq(bom.id, id));
    if (!existing) throw new AppError("BOM not found");
    number = existing.number;
    await db
      .update(bom)
      .set({
        name: input.name,
        productId: input.productId,
        outputQty: round3(input.outputQty && input.outputQty > 0 ? input.outputQty : 1),
        laborCost: round2(input.laborCost ?? 0),
        overheadCost: round2(input.overheadCost ?? 0),
        notes: input.notes ?? null,
        isActive: input.isActive ?? true,
      })
      .where(eq(bom.id, id));

    await db.delete(bomLines).where(eq(bomLines.bomId, id));
    await logAudit(db, actor, { action: "update", entity: "bom", entityId: id, summary: `Updated BOM ${number}` });
  } else {
    number = await nextNumber(db, "BOM");
    const [row] = await db
      .insert(bom)
      .values({
        number,
        name: input.name,
        productId: input.productId,
        outputQty: round3(input.outputQty && input.outputQty > 0 ? input.outputQty : 1),
        laborCost: round2(input.laborCost ?? 0),
        overheadCost: round2(input.overheadCost ?? 0),
        notes: input.notes ?? null,
        isActive: input.isActive ?? true,
        createdBy: actor?.id ?? null,
      })
      .returning();
    id = row.id;
    await logAudit(db, actor, { action: "create", entity: "bom", entityId: id, summary: `Created BOM ${number}` });
  }

  await db.insert(bomLines).values(
    input.lines.map((l, idx) => ({
      bomId: id!,
      lineNo: idx + 1,
      productId: l.productId,
      qty: round3(l.qty),
      scrapPct: round2(l.scrapPct ?? 0),
      notes: l.notes ?? null,
    }))
  );

  return { id, number };
}

// ---- Work Order Service ------------------------------------------------------------------------

export interface WorkOrderLineInput {
  productId: string;
  actualQty: number;
  notes?: string | null;
}

export interface SaveWorkOrderInput {
  id?: string;
  date: string;
  dueDate?: string | null;
  bomId?: string | null;
  productId: string;
  targetQty: number;
  warehouseId: string;
  laborCost?: number;
  overheadCost?: number;
  notes?: string | null;
  lines: { productId: string; plannedQty: number; actualQty?: number; notes?: string | null }[];
}

export async function saveWorkOrder(db: DbOrTx, actor: Actor | null, input: SaveWorkOrderInput) {
  const [product] = await db.select().from(products).where(eq(products.id, input.productId));
  if (!product) throw new AppError("Product not found");
  const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, input.warehouseId));
  if (!warehouse) throw new AppError("Warehouse not found");

  if (input.targetQty <= 0) throw new AppError("Target quantity must be greater than zero");

  let id = input.id;
  let number: string;

  if (id) {
    const [existing] = await db.select().from(workOrders).where(eq(workOrders.id, id));
    if (!existing) throw new AppError("Work order not found");
    if (existing.status !== "draft" && existing.status !== "confirmed") {
      throw new AppError(`Cannot edit work order in status ${existing.status}`);
    }
    number = existing.number;

    await db
      .update(workOrders)
      .set({
        date: input.date,
        dueDate: input.dueDate ?? null,
        bomId: input.bomId ?? null,
        productId: input.productId,
        targetQty: round3(input.targetQty),
        warehouseId: input.warehouseId,
        laborCost: round2(input.laborCost ?? 0),
        overheadCost: round2(input.overheadCost ?? 0),
        notes: input.notes ?? null,
      })
      .where(eq(workOrders.id, id));

    await db.delete(workOrderLines).where(eq(workOrderLines.workOrderId, id));
    await logAudit(db, actor, { action: "update", entity: "work_order", entityId: id, summary: `Updated work order ${number}` });
  } else {
    number = await nextNumber(db, "WO");
    const [row] = await db
      .insert(workOrders)
      .values({
        number,
        date: input.date,
        dueDate: input.dueDate ?? null,
        bomId: input.bomId ?? null,
        productId: input.productId,
        targetQty: round3(input.targetQty),
        warehouseId: input.warehouseId,
        laborCost: round2(input.laborCost ?? 0),
        overheadCost: round2(input.overheadCost ?? 0),
        notes: input.notes ?? null,
        status: "draft",
        createdBy: actor?.id ?? null,
      })
      .returning();
    id = row.id;
    await logAudit(db, actor, { action: "create", entity: "work_order", entityId: id, summary: `Created work order ${number}` });
  }

  await db.insert(workOrderLines).values(
    input.lines.map((l, idx) => ({
      workOrderId: id!,
      lineNo: idx + 1,
      productId: l.productId,
      plannedQty: round3(l.plannedQty),
      actualQty: round3(l.actualQty ?? l.plannedQty),
      notes: l.notes ?? null,
    }))
  );

  return { id, number };
}

export async function confirmWorkOrder(db: DbOrTx, actor: Actor | null, id: string) {
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id));
  if (!wo) throw new AppError("Work order not found");
  if (wo.status !== "draft") throw new AppError(`Work order ${wo.number} is already ${wo.status}`);

  await db.update(workOrders).set({ status: "confirmed" }).where(eq(workOrders.id, id));
  await logAudit(db, actor, { action: "post", entity: "work_order", entityId: id, summary: `Confirmed work order ${wo.number}` });
  return { id };
}

export async function cancelWorkOrder(db: DbOrTx, actor: Actor | null, id: string, reason?: string | null) {
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id));
  if (!wo) throw new AppError("Work order not found");
  if (wo.status === "completed") throw new AppError("Completed work orders cannot be cancelled");
  if (wo.status === "cancelled") throw new AppError("Work order is already cancelled");

  await db.update(workOrders).set({ status: "cancelled", notes: reason ? `${wo.notes ? wo.notes + "\n" : ""}[Cancelled]: ${reason}` : wo.notes }).where(eq(workOrders.id, id));
  await logAudit(db, actor, { action: "void", entity: "work_order", entityId: id, summary: `Cancelled work order ${wo.number}` });
  return { id };
}

export interface CompleteWorkOrderInput {
  id: string;
  producedQty: number;
  completionDate?: string;
  consumptions: { lineId: string; actualQty: number }[];
}

/**
 * Completes a work order:
 * 1. Issues raw materials from stock (moving-average valuation).
 * 2. Adds finished goods into inventory at (total material cost + labor + overhead) / producedQty.
 * 3. Automatically posts the balanced manufacturing journal.
 */
export async function completeWorkOrder(db: DbOrTx, actor: Actor | null, input: CompleteWorkOrderInput) {
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, input.id));
  if (!wo) throw new AppError("Work order not found");
  if (wo.status === "completed") throw new AppError(`Work order ${wo.number} is already completed`);
  if (wo.status === "cancelled") throw new AppError("Cannot complete a cancelled work order");

  if (input.producedQty <= 0) throw new AppError("Produced quantity must be greater than zero");

  const lines = await db.select().from(workOrderLines).where(eq(workOrderLines.workOrderId, wo.id)).orderBy(asc(workOrderLines.lineNo));
  const consMap = new Map(input.consumptions.map((c) => [c.lineId, c.actualQty]));

  const completionDate = input.completionDate ?? today();

  let totalMaterialCost = 0;

  // 1. Issue raw materials from stock
  for (const line of lines) {
    const qtyToIssue = consMap.has(line.id) ? consMap.get(line.id)! : line.actualQty;
    if (qtyToIssue > 0) {
      const moved = await moveStock(db, actor, {
        date: completionDate,
        productId: line.productId,
        warehouseId: wo.warehouseId,
        qty: -qtyToIssue,
        sourceType: "production_issue",
        sourceId: wo.id,
        sourceNumber: wo.number,
        notes: `Work Order ${wo.number} material consumption`,
      });

      const lineCost = round2(Math.abs(moved.value));
      totalMaterialCost = round2(totalMaterialCost + lineCost);

      await db
        .update(workOrderLines)
        .set({
          actualQty: round3(qtyToIssue),
          unitCost: moved.unitCost,
          totalCost: lineCost,
        })
        .where(eq(workOrderLines.id, line.id));
    }
  }

  const labor = wo.laborCost;
  const overhead = wo.overheadCost;
  const totalCost = round2(totalMaterialCost + labor + overhead);
  const unitCost = round2(totalCost / input.producedQty);

  // 2. Receive finished goods into stock
  await moveStock(db, actor, {
    date: completionDate,
    productId: wo.productId,
    warehouseId: wo.warehouseId,
    qty: input.producedQty,
    unitCost,
    sourceType: "production_receipt",
    sourceId: wo.id,
    sourceNumber: wo.number,
    notes: `Work Order ${wo.number} finished goods receipt`,
  });

  // 3. Post General Ledger Journal Entry
  // Dr Finished Goods Inventory (totalCost)
  //   Cr Raw Material Inventory (totalMaterialCost)
  //   Cr Direct Expenses / Overhead Absorption (labor + overhead)
  const journalLinesToPost = [
    { account: String(ACC.INVENTORY), debit: totalCost, memo: `Production receipt: WO ${wo.number}` },
    { account: String(ACC.INVENTORY), credit: totalMaterialCost, memo: `Raw materials consumed: WO ${wo.number}` },
  ];

  const additionalCost = round2(labor + overhead);
  if (additionalCost > 0) {
    journalLinesToPost.push({
      account: String(ACC.GENERAL_EXPENSE),
      credit: additionalCost,
      memo: `Labor & Overhead absorbed: WO ${wo.number}`,
    });
  }

  const je = await postJournal(db, actor, {
    date: completionDate,
    memo: `Manufacturing output for Work Order ${wo.number}`,
    sourceType: "production",
    sourceId: wo.id,
    sourceNumber: wo.number,
    lines: journalLinesToPost,
  });

  // 4. Update Work Order header
  await db
    .update(workOrders)
    .set({
      status: "completed",
      producedQty: round3(input.producedQty),
      materialCost: totalMaterialCost,
      totalCost,
      unitCost,
      journalEntryId: je.id,
      completedAt: completionDate,
    })
    .where(eq(workOrders.id, wo.id));

  await logAudit(db, actor, {
    action: "post",
    entity: "work_order",
    entityId: wo.id,
    summary: `Completed work order ${wo.number} (${input.producedQty} produced @ ${unitCost})`,
  });

  return { id: wo.id, number: wo.number, totalCost, unitCost };
}
