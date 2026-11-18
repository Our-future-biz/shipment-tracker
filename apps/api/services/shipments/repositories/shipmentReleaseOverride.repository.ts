import type { Tx } from "../db/db";
import { shipmentReleaseOverrideTable, type NewShipmentReleaseOverrideRecord } from "../schemas/shipmentReleaseOverride.schema";

// A manager's release of an unpaid prepayment job (lib/prepaymentStop): written only in the release's own write turn.
class ShipmentReleaseOverrideRepository {
  async create(tx: Tx, row: NewShipmentReleaseOverrideRecord): Promise<void> {
    await tx.insert(shipmentReleaseOverrideTable).values(row);
  }
}

export const shipmentReleaseOverrideRepository = new ShipmentReleaseOverrideRepository();
