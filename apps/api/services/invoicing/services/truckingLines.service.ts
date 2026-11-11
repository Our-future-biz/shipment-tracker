import { APIError } from "encore.dev/api";
import { isUuid } from "../../../lib/uuid";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { truckingLinesRepository } from "../repositories/truckingLines.repository";
import { checkLines, checkSourceRef, DIFFERENCE_LABEL, truckingBuyingRow, truckingSellingRow } from "../utils/truckingLines.utils";
import type { TruckingCostLine, TruckingLinesResult } from "../interfaces/interfaces";

export interface TruckingLinesPush {
  shipmentId: string;
  sourceRef: string;
  buying: TruckingCostLine[];
  selling: TruckingCostLine[];
  /** The description of a difference line, when the selling set is kept (default "Price change after invoice") */
  differenceLabel?: string;
}

class TruckingLinesService {
  /**
   * Replaces what one Trucking consignment (selling) or trip (buying) keeps in the shipment's
   * Costs Breakdown with the lines sent; empty lists remove them (a cancel). A selling set on an
   * issued invoice stays and only the difference is added as its own line (decision 9).
   * Idempotent: the same push twice leaves the same rows.
   *
   * The shipment must be live in the company (not_found otherwise): a push still owed for a job
   * deleted meanwhile - its rows retired here when it was deleted - would write rows nobody sees
   * on a job that no longer exists. Trucking's outbox takes not_found as final.
   */
  async replace(companyId: string, push: TruckingLinesPush): Promise<TruckingLinesResult> {
    if (!isUuid(push.shipmentId)) throw APIError.invalidArgument("Not a shipment id");
    const sourceRef = checkSourceRef(push.sourceRef);
    const buying = checkLines(push.buying, "buying").map(truckingBuyingRow);
    const selling = checkLines(push.selling, "selling").map((l) => truckingSellingRow(l, l.description));
    const label = (push.differenceLabel ?? "").trim().slice(0, 500) || DIFFERENCE_LABEL;
    await assertShipmentExists(push.shipmentId);
    return truckingLinesRepository.replace(companyId, push.shipmentId, sourceRef, buying, selling, label);
  }
}

export const truckingLinesService = new TruckingLinesService();
