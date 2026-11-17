import { billOfLadingKey } from "../../../lib/billOfLading";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import type { ReadingMatches } from "../interfaces/interfaces";

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
}

export const readingMatchService = new ReadingMatchService();
