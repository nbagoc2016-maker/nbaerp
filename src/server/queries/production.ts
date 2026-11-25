import "server-only";
import { and, asc, count, desc, eq, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import {
  bom,
  bomLines,
  machineTypes,
  products,
  units,
  warehouses,
  workOrderLines,
  workOrders,
  WORK_ORDER_STATUSES,
  type WorkOrderStatus,
} from "@/db/schema";

export async function listBoms() {
  const rows = await db
    .select({
      id: bom.id,
      number: bom.number,
      name: bom.name,
      productId: bom.productId,
      productName: products.name,
      productSku: products.sku,
      unitCode: units.code,
      outputQty: bom.outputQty,
      laborCost: bom.laborCost,
      overheadCost: bom.overheadCost,
      isActive: bom.isActive,
      createdAt: bom.createdAt,
    })
    .from(bom)
    .innerJoin(products, eq(products.id, bom.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .orderBy(desc(bom.createdAt));

  return rows;
}

// ---- Machine Types -------------------------------------------------------------------------

export async function listMachineTypes() {
  return db
    .select({
      id: machineTypes.id,
      code: machineTypes.code,
      name: machineTypes.name,
      description: machineTypes.description,
      capacity: machineTypes.capacity,
      isActive: machineTypes.isActive,
      createdAt: machineTypes.createdAt,
    })
    .from(machineTypes)
    .orderBy(asc(machineTypes.code));
}

export async function getMachineType(id: string) {
  const [row] = await db
    .select()
    .from(machineTypes)
    .where(eq(machineTypes.id, id));
  return row ?? null;
}

export interface MachineReportFilter {
  from?: string;
  to?: string;
  machineTypeId?: string;
}

export async function machineProductionReport(f?: MachineReportFilter) {
  const where: ReturnType<typeof eq>[] = [];
  if (f?.machineTypeId) where.push(eq(workOrders.machineTypeId, f.machineTypeId));
  if (f?.from) where.push(sql`${workOrders.date} >= ${f.from}` as unknown as ReturnType<typeof eq>);
  if (f?.to)   where.push(sql`${workOrders.date} <= ${f.to}`   as unknown as ReturnType<typeof eq>);

  const rows = await db
    .select({
      machineTypeId: machineTypes.id,
      machineCode: machineTypes.code,
      machineName: machineTypes.name,
      workOrderCount: count(workOrders.id),
      totalProducedQty: sum(workOrders.producedQty),
      totalMaterialCost: sum(workOrders.materialCost),
      totalLaborCost: sum(workOrders.laborCost),
      totalOverheadCost: sum(workOrders.overheadCost),
      totalCost: sum(workOrders.totalCost),
    })
    .from(workOrders)
    .innerJoin(machineTypes, eq(machineTypes.id, workOrders.machineTypeId))
    .where(where.length ? and(...where) : undefined)
    .groupBy(machineTypes.id, machineTypes.code, machineTypes.name)
    .orderBy(asc(machineTypes.code));

  return rows;
}

export async function getBom(id: string) {
  const [b] = await db
    .select({
      id: bom.id,
      number: bom.number,
      name: bom.name,
      productId: bom.productId,
      productName: products.name,
      productSku: products.sku,
      unitCode: units.code,
      outputQty: bom.outputQty,
      laborCost: bom.laborCost,
      overheadCost: bom.overheadCost,
      notes: bom.notes,
      isActive: bom.isActive,
      createdAt: bom.createdAt,
    })
    .from(bom)
    .innerJoin(products, eq(products.id, bom.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .where(eq(bom.id, id));

  if (!b) return null;

  const lines = await db
    .select({
      id: bomLines.id,
      lineNo: bomLines.lineNo,
      productId: bomLines.productId,
      productName: products.name,
      productSku: products.sku,
      unitCode: units.code,
      qty: bomLines.qty,
      scrapPct: bomLines.scrapPct,
      notes: bomLines.notes,
    })
    .from(bomLines)
    .innerJoin(products, eq(products.id, bomLines.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .where(eq(bomLines.bomId, id))
    .orderBy(asc(bomLines.lineNo));

  return { bom: b, lines };
}

export async function listWorkOrders(f?: { status?: string }) {
  const where = [];
  if (f?.status && f.status !== "all" && (WORK_ORDER_STATUSES as readonly string[]).includes(f.status)) {
    where.push(eq(workOrders.status, f.status as WorkOrderStatus));
  }

  const rows = await db
    .select({
      id: workOrders.id,
      number: workOrders.number,
      date: workOrders.date,
      dueDate: workOrders.dueDate,
      productName: products.name,
      productSku: products.sku,
      unitCode: units.code,
      targetQty: workOrders.targetQty,
      producedQty: workOrders.producedQty,
      warehouseName: warehouses.name,
      status: workOrders.status,
      totalCost: workOrders.totalCost,
      unitCost: workOrders.unitCost,
      completedAt: workOrders.completedAt,
      machineTypeId: workOrders.machineTypeId,
      machineTypeName: machineTypes.name,
    })
    .from(workOrders)
    .innerJoin(products, eq(products.id, workOrders.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .innerJoin(warehouses, eq(warehouses.id, workOrders.warehouseId))
    .leftJoin(machineTypes, eq(machineTypes.id, workOrders.machineTypeId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(workOrders.date), desc(workOrders.number));

  return rows;
}

export async function getWorkOrder(id: string) {
  const [wo] = await db
    .select({
      id: workOrders.id,
      number: workOrders.number,
      date: workOrders.date,
      dueDate: workOrders.dueDate,
      bomId: workOrders.bomId,
      productId: workOrders.productId,
      productName: products.name,
      productSku: products.sku,
      unitCode: units.code,
      targetQty: workOrders.targetQty,
      producedQty: workOrders.producedQty,
      warehouseId: workOrders.warehouseId,
      warehouseName: warehouses.name,
      status: workOrders.status,
      laborCost: workOrders.laborCost,
      overheadCost: workOrders.overheadCost,
      materialCost: workOrders.materialCost,
      totalCost: workOrders.totalCost,
      unitCost: workOrders.unitCost,
      machineTypeId: workOrders.machineTypeId,
      machineTypeName: machineTypes.name,
      machineTypeCode: machineTypes.code,
      journalEntryId: workOrders.journalEntryId,
      completedAt: workOrders.completedAt,
      notes: workOrders.notes,
      createdAt: workOrders.createdAt,
    })
    .from(workOrders)
    .innerJoin(products, eq(products.id, workOrders.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .innerJoin(warehouses, eq(warehouses.id, workOrders.warehouseId))
    .leftJoin(machineTypes, eq(machineTypes.id, workOrders.machineTypeId))
    .where(eq(workOrders.id, id));

  if (!wo) return null;

  const lines = await db
    .select({
      id: workOrderLines.id,
      lineNo: workOrderLines.lineNo,
      productId: workOrderLines.productId,
      productName: products.name,
      productSku: products.sku,
      unitCode: units.code,
      plannedQty: workOrderLines.plannedQty,
      actualQty: workOrderLines.actualQty,
      unitCost: workOrderLines.unitCost,
      totalCost: workOrderLines.totalCost,
      notes: workOrderLines.notes,
    })
    .from(workOrderLines)
    .innerJoin(products, eq(products.id, workOrderLines.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .where(eq(workOrderLines.workOrderId, id))
    .orderBy(asc(workOrderLines.lineNo));

  return { order: wo, lines };
}


export async function listbomlines(id: string) {
  const lines = await db
    .select({
      id: bomLines.id,
      lineNo: bomLines.lineNo,
      productId: bomLines.productId,
      productName: products.name,
      productSku: products.sku,
      unitCode: units.code,
      qty: bomLines.qty,
      scrapPct: bomLines.scrapPct,
      notes: bomLines.notes,
    })
    .from(bomLines)
    .innerJoin(products, eq(products.id, bomLines.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .where(eq(bomLines.bomId, id))
    .orderBy(asc(bomLines.lineNo));

  return lines;
} 

export async function listbomandlines() {
  const boms = await listBoms();
  const bomsWithLines = await Promise.all(
    boms.map(async (bom) => {
      const lines = await listbomlines(bom.id);
      const bomWithLines = { ...bom, lines };
      return bomWithLines;
    })
  );

  return { boms: bomsWithLines };
}