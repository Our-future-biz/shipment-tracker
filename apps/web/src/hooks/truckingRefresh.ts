import type { QueryClient } from "@tanstack/react-query";
import { truckingKeys } from "./truckingKeys";
import { invalidateShipmentCustomerViews, invalidateShipmentDerivedViews } from "./useShipments";
import { invalidateInvoicingDerived } from "./useInvoiceQueue";
import { gateKeys, sectionKeys } from "./warehouseKeys";

// Trucking writes reach other modules on the server: the job's dates, plate and status, its costs,
// the billing queue, the customer's rollups, and (through an outbox) the warehouse gate rows and
// pick-up legs. Everything that shows those is read again after a trucking write.

/** The warehouse rows Trucking fills arrive through an outbox, a moment after the write answers. */
export const OUTBOX_SETTLE_MS = 2500;

function invalidateWarehouse(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: gateKeys.all });
  void queryClient.invalidateQueries({ queryKey: sectionKeys.all });
}

/** Everything a consignment, trip or haulier-invoice change can move. */
export function invalidateAfterTruckingWrite(queryClient: QueryClient): Promise<unknown> {
  invalidateShipmentDerivedViews(queryClient);
  invalidateShipmentCustomerViews(queryClient);
  invalidateInvoicingDerived(queryClient);
  invalidateWarehouse(queryClient);
  // Once more after the outbox delivered to Warehouse.
  setTimeout(() => invalidateWarehouse(queryClient), OUTBOX_SETTLE_MS);
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: truckingKeys.consignments() }),
    queryClient.invalidateQueries({ queryKey: truckingKeys.trips() }),
    queryClient.invalidateQueries({ queryKey: truckingKeys.planning() }),
    queryClient.invalidateQueries({ queryKey: ["shipments"] }),
    queryClient.invalidateQueries({ queryKey: ["invoicing"] }),
  ]);
}
