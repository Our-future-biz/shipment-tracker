"use client";

import { api } from "@/lib/api";
import { useShipments } from "@/hooks/useShipments";
import { useToast } from "@/lib/toast";

// A shipment moves through the warehouse pages by two dates it carries itself:
//   In Warehouse → (Naskladnit, warehouseReceivedDate) → Stock
//     Taking a shipment in also gives it its warehouse reference (WHCZ + year + a running
//     number), once: it keeps the same one if it is returned and taken in again.
//   Stock → (Vyskladnit, warehouseReleasedDate) → Out Warehouse
//     A shipment leaves on a truck and carries the truck's reference (warehouseTruck,
//     TCZ + year + a running number); stepping back from Out Warehouse takes it off again.
//     The plate number is the truck's: the server keeps it the same on all its shipments.
//   Stock → (Vrátit do In Warehouse, warehouseReceivedDate cleared) → In Warehouse
//   Out Warehouse → (Vrátit do In Warehouse, both dates cleared) → In Warehouse
//   Out Warehouse → (Vrátit do Stock, warehouseReleasedDate cleared) → Stock
// Nothing is copied between the pages; each one lists the shipments at its step.

/** Today as the API stores dates (YYYY-MM-DD), in local time. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const NOTHING_TICKED = "Tick the shipments in the table first";

type WarehouseDate = "warehouseReceivedDate" | "warehouseReleasedDate";

/**
 * Moves the ticked shipments to `movedTo` by setting each given date to today ("today")
 * or emptying it ("clear"). With `assignReference` each shipment is also given its
 * warehouse reference first; if that fails nothing is moved. `clearTruck` takes the
 * shipments off their truck; a `truck` passed to the move itself puts them on one.
 * The move resolves to whether it went through.
 */
export function useWarehouseMove(
  dates: Partial<Record<WarehouseDate, "today" | "clear">>,
  movedTo: string,
  { assignReference = false, clearTruck = false }: { assignReference?: boolean; clearTruck?: boolean } = {},
) {
  const { updateShipment } = useShipments();
  const toast = useToast();

  return async (ids: string[], truck?: string): Promise<boolean> => {
    if (ids.length === 0) {
      toast.error(NOTHING_TICKED);
      return false;
    }
    try {
      const today = todayIso();
      // An empty string is how the API is told to clear a date.
      const data: Record<string, string> = Object.fromEntries(
        Object.entries(dates).map(([field, to]) => [field, to === "today" ? today : ""]),
      );
      if (clearTruck) data.warehouseTruck = "";
      if (truck) data.warehouseTruck = truck;
      const refs = assignReference ? (await api.warehouse.warehouseEnsureRefs({ shipmentIds: ids })).refs : [];
      const referenceOf = new Map(refs.map((r) => [r.shipmentId, r.reference]));
      await Promise.all(
        ids.map((id) => {
          const warehouseReference = referenceOf.get(id);
          return updateShipment({ id, data: warehouseReference ? { ...data, warehouseReference } : data });
        }),
      );
      toast.success(`${ids.length} shipment${ids.length === 1 ? "" : "s"} moved to ${movedTo}${truck ? ` on truck ${truck}` : ""}`);
      return true;
    } catch {
      toast.error(`Could not move the shipments to ${movedTo}`);
      return false;
    }
  };
}
