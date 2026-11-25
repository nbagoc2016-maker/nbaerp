"use server";

import { z } from "zod";
import { action } from "@/server/action";
import {
  cancelWorkOrder,
  completeWorkOrder,
  confirmWorkOrder,
  saveBom,
  saveMachineType,
  saveWorkOrder,
} from "@/server/services/production";

const zBomLine = z.object({
  productId: z.string().min(1, "Select product"),
  qty: z.coerce.number().positive("Quantity must be positive"),
  scrapPct: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
});

const zSaveBom = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "BOM name is required"),
  productId: z.string().min(1, "Finished good product is required"),
  outputQty: z.coerce.number().positive().default(1),
  laborCost: z.coerce.number().min(0).optional(),
  overheadCost: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
  isActive: z.boolean().default(true),
  lines: z.array(zBomLine).min(1, "Add at least one raw material"),
});

export const saveBomAction = action(
  { permission: "production.manage", schema: zSaveBom, revalidate: ["/production", "/production/bom"] },
  async (input, { tx, actor }) => saveBom(tx, actor, input)
);

const zWorkOrderLine = z.object({
  productId: z.string().min(1),
  plannedQty: z.coerce.number().positive(),
  actualQty: z.coerce.number().positive().optional(),
  notes: z.string().trim().optional(),
});

const zSaveWorkOrder = z.object({
  id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter valid date"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  bomId: z.string().optional().or(z.literal("")),
  productId: z.string().min(1, "Select product to manufacture"),
  targetQty: z.coerce.number().positive("Target quantity must be greater than 0"),
  warehouseId: z.string().min(1, "Select warehouse"),
  machineTypeId: z.string().optional().or(z.literal("")),
  laborCost: z.coerce.number().min(0).optional(),
  overheadCost: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
  lines: z.array(zWorkOrderLine).min(1, "Add at least one raw material"),
});

export const saveWorkOrderAction = action(
  { permission: "production.manage", schema: zSaveWorkOrder, revalidate: ["/production", "/production/orders"] },
  async (input, { tx, actor }) => saveWorkOrder(tx, actor, input)
);

export const confirmWorkOrderAction = action(
  { permission: "production.manage", schema: z.object({ id: z.string().min(1) }), revalidate: ["/production", "/production/orders"] },
  async (input, { tx, actor }) => confirmWorkOrder(tx, actor, input.id)
);

export const cancelWorkOrderAction = action(
  {
    permission: "production.cancel",
    schema: z.object({ id: z.string().min(1), reason: z.string().trim().optional() }),
    revalidate: ["/production", "/production/orders"],
  },
  async (input, { tx, actor }) => cancelWorkOrder(tx, actor, input.id, input.reason)
);

const zCompleteWorkOrder = z.object({
  id: z.string().min(1),
  producedQty: z.coerce.number().positive("Produced quantity must be positive"),
  completionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  consumptions: z.array(
    z.object({
      lineId: z.string().min(1),
      actualQty: z.coerce.number().min(0, "Consumed quantity cannot be negative"),
    })
  ),
});

export const completeWorkOrderAction = action(
  {
    permission: "production.complete",
    schema: zCompleteWorkOrder,
    revalidate: ["/production", "/production/orders", "/inventory", "/accounting"],
  },
  async (input, { tx, actor }) => completeWorkOrder(tx, actor, input)
);

const zSaveMachineType = z.object({
  id: z.string().optional(),
  code: z.string().trim().max(50).optional().or(z.literal("")),
  name: z.string().trim().min(1, "Machine type name is required"),
  description: z.string().trim().optional().or(z.literal("")),
  capacity: z.coerce.number().min(0).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export const saveMachineTypeAction = action(
  {
    permission: "production.manage",
    schema: zSaveMachineType,
    revalidate: ["/production", "/production/machines", "/production/machine-report"],
  },
  async (input, { tx, actor }) =>
    saveMachineType(tx, actor, {
      id: input.id,
      code: input.code || undefined,
      name: input.name,
      description: input.description || null,
      capacity: input.capacity === "" || input.capacity == null ? null : Number(input.capacity),
      isActive: input.isActive,
    })
);
