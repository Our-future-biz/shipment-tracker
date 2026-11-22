import { billOfLadingKey } from "../../../lib/billOfLading";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentService } from "./shipment.service";
import type { ReadingMatches, ShipmentItem } from "../interfaces/interfaces";

type HouseBolShipment = { id: string; jobNumber: string; key: string; status: string };

/**
 * The shipment a reading of each House B/L goes to, by its key: of the live shipments that have it (the
 * oldest first), the oldest that is not cancelled - a cancelled one only when no other has it. A House B/L is
 * not unique on a manual create or edit (review of system-23): the oldest alone offered an old cancelled job,
 * and the reading was written into it instead of the active one.
 */
function shipmentOfEachKey(found: readonly HouseBolShipment[]): Map<string, HouseBolShipment> {
  const chosen = new Map<string, HouseBolShipment>();
  const cancelled = (s: HouseBolShipment) => (s.status ?? "").trim() === CANCELLED_STATUS;
  for (const s of found) {
    const had = chosen.get(s.key);
    if (!had || (cancelled(had) && !cancelled(s))) chosen.set(s.key, s);
  }
  return chosen;
}

class ReadingMatchService {
  /**
   * The company's live shipment of each House B/L (the oldest not cancelled, by billOfLadingKey: shipmentOfEachKey;
   * keyed by the B/L as asked) and its live master job with the Master B/L. A B/L none has is left out.
   */
  async matches(companyId: string, houseBols: string[], masterBol: string): Promise<ReadingMatches> {
    const [found, masterJob] = await Promise.all([
      shipmentRepository.liveByHouseBols(companyId, houseBols),
      billOfLadingKey(masterBol) ? masterJobRepository.liveByMasterBol(companyId, masterBol) : Promise.resolve(null),
    ]);
    const chosen = shipmentOfEachKey(found);
    const shipments = [...new Set(houseBols)].flatMap((houseBol) => {
      const s = chosen.get(billOfLadingKey(houseBol));
      return s ? [{ houseBol, shipmentId: s.id, jobNumber: s.jobNumber }] : [];
    });
    return { shipments, masterJob };
  }

  /**
   * The company's live shipment that has this House B/L already (the oldest not cancelled, by billOfLadingKey:
   * shipmentOfEachKey), whole, or null. Documents asks it before a reading creates a new shipment: the user is
   * shown that shipment and writes the reading into it, or creates a new job anyway.
   */
  async shipmentOfHouseBol(companyId: string, houseBol: string): Promise<ShipmentItem | null> {
    const key = billOfLadingKey(houseBol);
    if (!key) return null;
    const s = shipmentOfEachKey(await shipmentRepository.liveByHouseBols(companyId, [houseBol])).get(key);
    return s ? shipmentService.getById(s.id, companyId) : null;
  }
}

export const readingMatchService = new ReadingMatchService();
