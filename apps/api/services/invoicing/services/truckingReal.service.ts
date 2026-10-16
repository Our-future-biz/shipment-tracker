import { APIError } from "encore.dev/api";
import { isUuid } from "../../../lib/uuid";
import { truckingLinesRepository } from "../repositories/truckingLines.repository";
import { checkRealLines, checkRealSourceRef } from "../utils/truckingReal.utils";
import type { TruckingRealLine, TruckingRealResult } from "../interfaces/interfaces";

export interface TruckingRealPush {
  shipmentId: string;
  sourceRef: string;
  realLines: TruckingRealLine[];
}

class TruckingRealService {
  /**
   * Sets the real side of the live buying rows Trucking keeps under a sourceRef: each line on the
   * row with its description, else by position (an empty list clears the real side). Refused only
   * when the lines cannot be placed (no row of the ref, or none in an extra line's currency).
   * Idempotent. Buying rows are never on a customer invoice, so they may always be written.
   */
  async setReal(companyId: string, push: TruckingRealPush): Promise<TruckingRealResult> {
    if (!isUuid(push.shipmentId)) throw APIError.invalidArgument("Not a shipment id");
    const sourceRef = checkRealSourceRef(push.sourceRef);
    const lines = checkRealLines(push.realLines);
    const updated = await truckingLinesRepository.setReal(companyId, push.shipmentId, sourceRef, lines);
    if (updated === null) throw APIError.failedPrecondition("The job has no Trucking rows of this trip or delivery to put the real amounts on");
    return { updated };
  }
}

export const truckingRealService = new TruckingRealService();
