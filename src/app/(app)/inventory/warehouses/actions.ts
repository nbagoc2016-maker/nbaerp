"use server";

import { action } from "@/server/action";
import { idSchema, locationSchema, warehouseSchema } from "@/server/services/inventory-schemas";
import { deleteLocation, deleteWarehouse, saveLocation, saveWarehouse } from "@/server/services/inventory-setup";

const revalidate = ["/inventory"];

export const saveWarehouseAction = action({ permission: "inventory.warehouses", schema: warehouseSchema, revalidate }, async (input, { tx, actor }) =>
  saveWarehouse(tx, actor, input)
);

export const deleteWarehouseAction = action({ permission: "inventory.warehouses", schema: idSchema, revalidate }, async (input, { tx, actor }) =>
  deleteWarehouse(tx, actor, input.id)
);

export const saveLocationAction = action({ permission: "inventory.warehouses", schema: locationSchema, revalidate }, async (input, { tx, actor }) =>
  saveLocation(tx, actor, input)
);

export const deleteLocationAction = action({ permission: "inventory.warehouses", schema: idSchema, revalidate }, async (input, { tx, actor }) =>
  deleteLocation(tx, actor, input.id)
);
