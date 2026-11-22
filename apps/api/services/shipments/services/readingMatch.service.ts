import { billOfLadingKey } from "../../../lib/billOfLading";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentService } from "./shipment.service";
import type { ReadingMatches, ShipmentItem } from "../interfaces/interfaces";

class ReadingMatchService {
  /**
   * The company's live shipment of each House B/L (the oldest, by billOfLadingKey; keyed by the B/L
   * as asked) and its live master job with the Master B/L. A B/L none has is left out.
   */
  async matches(companyId: string, houseBols: string[], masterBol: string): Promise<ReadingMatches> {
    const [found, masterJob] = await Promise.all([
      shipmentRepository.liveByHouseBols(companyId, houseBols),
      billOfLadingKey(masterBol) ? masterJobRepository.liveByMasterBol(companyId, masterBol) : Promise.resolve(null),
    ]);
    const oldest = new Map<string, { id: string; jobNumber: string }>();
    for (const s of found) if (!oldest.has(s.key)) oldest.set(s.key, s);
    const shipments = [...new Set(houseBols)].flatMap((houseBol) => {
      const s = oldest.get(billOfLadingKey(houseBol));
      return s ? [{ houseBol, shipmentId: s.id, jobNumber: s.jobNumber }] : [];
    });
    return { shipments, masterJob };
  }

  /**
   * The company's live shipment that has this House B/L already (the oldest, by billOfLadingKey), whole, or
   * null. Documents asks it before a reading creates a new shipment: the user is shown that shipment and
   * writes the reading into it, or creates a new job anyway.
   */
  async shipmentOfHouseBol(companyId: string, houseBol: string): Promise<ShipmentItem | null> {
    if (!billOfLadingKey(houseBol)) return null;
    const [oldest] = await shipmentRepository.liveByHouseBols(companyId, [houseBol]);
    return oldest ? shipmentService.getById(oldest.id, companyId) : null;
  }
}

export const readingMatchService = new ReadingMatchService();
