import { APIError } from "encore.dev/api";
import { isUuid } from "../../../lib/uuid";
import { truckingLinesRepository } from "../repositories/truckingLines.repository";
import { checkLines, checkSourceRef, truckingBuyingRow, truckingSellingRow } from "../utils/truckingLines.utils";
import type { TruckingCostLine, TruckingLinesResult } from "../interfaces/interfaces";

export interface TruckingLinesPush {
  shipmentId: string;
  sourceRef: string;
  buying: TruckingCostLine[];
  selling: TruckingCostLine[];
}

class TruckingLinesService {
  /**
   * Replaces what one Trucking consignment (selling) or trip (buying) keeps in the shipment's
   * Costs Breakdown with the lines sent; empty lists remove them (a cancel). Idempotent: the same
   * push twice leaves the same rows. The shipment is not looked up - Trucking only pushes for its
   * jobs, and a deleted job's rows are retired with it.
   */
  async replace(companyId: string, push: TruckingLinesPush): Promise<TruckingLinesResult> {
    if (!isUuid(push.shipmentId)) throw APIError.invalidArgument("Not a shipment id");
    const sourceRef = checkSourceRef(push.sourceRef);
    const buying = checkLines(push.buying, "buying").map(truckingBuyingRow);
    const selling = checkLines(push.selling, "selling").map((l) => truckingSellingRow(l, l.description));
    return truckingLinesRepository.replace(companyId, push.shipmentId, sourceRef, buying, selling);
  }
}

export const truckingLinesService = new TruckingLinesService();
