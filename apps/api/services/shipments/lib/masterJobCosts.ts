import log from "encore.dev/log";
import { invoicing } from "~encore/clients";

/**
 * A shipment left these master jobs or was deleted: it gives up its shares of their costs
 * (invoicing), each master job once. A failure doesn't undo what changed the shipments; it is
 * logged, and processing the split takes the share off too.
 */
export async function dropSharesOfLeftShipments(masterJobIds: (string | null | undefined)[]): Promise<void> {
  for (const masterJobId of new Set(masterJobIds.filter((id): id is string => !!id))) {
    try {
      await invoicing._internalMasterJobShipmentLeft({ masterJobId });
    } catch (err) {
      log.error(err, "a shipment that left could not give up its share of the master job's costs", { masterJobId });
    }
  }
}
