import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { parseDateMMDDYY } from "@/lib/columnConfig";

// Which shipments each warehouse page lists. A shipment carries two dates of its own and
// moves by them: In Warehouse → (Naskladnit) → Stock → (Vyskladnit) → Out Warehouse.

const DAY = 86_400_000;
const ETA_WITHIN_DAYS = 7;

export const WAREHOUSE_SECTIONS = { in: "In Warehouse", stock: "Stock", out: "Out Warehouse" } as const;
export type WarehouseSection = keyof typeof WAREHOUSE_SECTIONS;

/** The columns a warehouse list starts with, until the user picks their own. */
export const WAREHOUSE_DEFAULT_COLUMNS = ["jobNumber", "warehouseReference", "customer", "etaWarehouse", "warehouseReceivedDate", "warehouseReleasedDate", "warehouseTruck", "plateNumber", "status"];

/**
 * The reference a section goes by, shown as the first column with Internal Reference next
 * to it: in Stock the shipment's warehouse reference (WHCZ…), in Out Warehouse the
 * reference of the truck it left on (TCZ…).
 */
export const WAREHOUSE_LEAD_COLUMN: Partial<Record<WarehouseSection, string>> = {
  stock: "warehouseReference",
  out: "warehouseTruck",
};

export const WAREHOUSE_RULES: Record<WarehouseSection, (shipment: ShipmentItem) => boolean> = {
  // Rule 1: listed once its ETA Warehouse/HUB is less than 7 days away. A date already
  // passed counts too; a shipment without the date is not listed.
  in: (shipment) => {
    if (shipment.warehouseReceivedDate || shipment.warehouseReleasedDate) return false;
    const eta = parseDateMMDDYY(getFieldValue(shipment, "etaWarehouse"));
    if (!eta) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((eta.getTime() - today.getTime()) / DAY) < ETA_WITHIN_DAYS;
  },
  // Taken into the warehouse and still in it.
  stock: (shipment) => !!shipment.warehouseReceivedDate && !shipment.warehouseReleasedDate,
  // Released from Stock.
  out: (shipment) => !!shipment.warehouseReleasedDate,
};
