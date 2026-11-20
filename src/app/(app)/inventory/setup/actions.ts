"use server";

import { action } from "@/server/action";
import { brandSchema, categorySchema, idSchema, taxRateSchema, unitSchema } from "@/server/services/inventory-schemas";
import {
  deleteBrand,
  deleteCategory,
  deleteTaxRate,
  deleteUnit,
  saveBrand,
  saveCategory,
  saveTaxRate,
  saveUnit,
} from "@/server/services/inventory-setup";

const revalidate = ["/inventory"];
const permission = "inventory.manage" as const;

export const saveCategoryAction = action({ permission, schema: categorySchema, revalidate }, async (i, { tx, actor }) => saveCategory(tx, actor, i));
export const deleteCategoryAction = action({ permission, schema: idSchema, revalidate }, async (i, { tx, actor }) => deleteCategory(tx, actor, i.id));
export const saveBrandAction = action({ permission, schema: brandSchema, revalidate }, async (i, { tx, actor }) => saveBrand(tx, actor, i));
export const deleteBrandAction = action({ permission, schema: idSchema, revalidate }, async (i, { tx, actor }) => deleteBrand(tx, actor, i.id));
export const saveUnitAction = action({ permission, schema: unitSchema, revalidate }, async (i, { tx, actor }) => saveUnit(tx, actor, i));
export const deleteUnitAction = action({ permission, schema: idSchema, revalidate }, async (i, { tx, actor }) => deleteUnit(tx, actor, i.id));
export const saveTaxRateAction = action({ permission, schema: taxRateSchema, revalidate }, async (i, { tx, actor }) => saveTaxRate(tx, actor, i));
export const deleteTaxRateAction = action({ permission, schema: idSchema, revalidate }, async (i, { tx, actor }) => deleteTaxRate(tx, actor, i.id));
