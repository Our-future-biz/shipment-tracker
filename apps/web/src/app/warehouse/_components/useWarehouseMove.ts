"use client";

import { useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { useShipmentMutations } from "@/hooks/useShipments";
import { moveOutcome, noneMoved, notMovedText, type MoveOutcome } from "../_lib/moveOutcome";
import { useToast } from "@/lib/toast";
import { todayIso } from "@/lib/date";

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


export const NOTHING_TICKED = "Tick the shipments in the table first";

type WarehouseDate = "warehouseReceivedDate" | "warehouseReleasedDate";

/** What a move may bring along: a manager's reason to release a job stopped for prepayment (Accounts Receivable step 7). */
export interface MoveOptions {
  paymentOverrideReason?: string;
  /** The dialog shows the stopped shipments itself: no toast for them. */
  stopsShown?: boolean;
}

type ShipmentsCache = { data?: { id: string; jobNumber?: string | null }[]; shipment?: { id: string; jobNumber?: string | null } };

/**
 * Moves the ticked shipments to `movedTo` by setting each given date to today ("today")
 * or emptying it ("clear"). With `assignReference` each shipment is also given its
 * warehouse reference first; if that fails nothing is moved. `clearTruck` takes the
 * shipments off their truck; a `truck` passed to the move itself puts them on one.
 * Each shipment is written on its own: the move resolves to what became of each one -
 * moved, stopped for prepayment (the server's refusal, which a manager may send again with
 * a reason), or refused otherwise - and says so per job.
 */
export function useWarehouseMove(
  dates: Partial<Record<WarehouseDate, "today" | "clear">>,
  movedTo: string,
  { assignReference = false, clearTruck = false }: { assignReference?: boolean; clearTruck?: boolean } = {},
) {
  const { updateShipment } = useShipmentMutations();
  const toast = useToast();
  const queryClient = useQueryClient();

  // The job number of a shipment, as a cached list or the shipment's own read holds it.
  const jobOf = (id: string): string => {
    for (const [, cached] of queryClient.getQueriesData<ShipmentsCache>({ queryKey: ["shipments"] })) {
      const found = cached?.shipment?.id === id ? cached.shipment : cached?.data?.find((s) => s.id === id);
      if (found?.jobNumber) return found.jobNumber;
    }
    return "";
  };

  return async (ids: string[], truck?: string, options: MoveOptions = {}): Promise<MoveOutcome> => {
    if (ids.length === 0) {
      toast.error(NOTHING_TICKED);
      return noneMoved(ids, NOTHING_TICKED);
    }
    const today = todayIso();
    // An empty string is how the API is told to clear a date.
    const data: controllers.ShipmentUpdateRequest = Object.fromEntries(
      Object.entries(dates).map(([field, to]) => [field, to === "today" ? today : ""]),
    );
    if (clearTruck) data.warehouseTruck = "";
    if (truck) data.warehouseTruck = truck;
    // Sent only with a release a manager gives a reason for; the server records it only when the job was stopped.
    const reason = (options.paymentOverrideReason ?? "").trim();
    if (reason) data.paymentOverrideReason = reason;
    let refs: { shipmentId: string; reference: string }[] = [];
    try {
      refs = assignReference ? (await api.warehouse.warehouseEnsureRefs({ shipmentIds: ids })).refs : [];
    } catch (err) {
      toast.error(`Could not move the shipments to ${movedTo}: ${apiErrorMessage(err)}`);
      return noneMoved(ids, apiErrorMessage(err));
    }
    const referenceOf = new Map(refs.map((r) => [r.shipmentId, r.reference]));
    const results = await Promise.allSettled(
      ids.map((id) => {
        const warehouseReference = referenceOf.get(id);
        return updateShipment({ id, data: warehouseReference ? { ...data, warehouseReference } : data });
      }),
    );
    const outcome = moveOutcome(ids, results, apiErrorMessage);
    const n = outcome.moved.length;
    if (n > 0) toast.success(`${n} shipment${n === 1 ? "" : "s"} moved to ${movedTo}${truck ? ` on truck ${truck}` : ""}`);
    // The server's reason, per job: a received date only a manager may clear, a release before the receipt, a stop.
    const notMoved = notMovedText(outcome, jobOf, !options.stopsShown);
    if (notMoved) toast.error(`Could not move to ${movedTo}: ${notMoved}`);
    return outcome;
  };
}
