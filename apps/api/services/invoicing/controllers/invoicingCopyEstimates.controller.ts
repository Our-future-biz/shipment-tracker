import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { copyEstimates } from "../services/estimateCopy.service";

interface CopyEstimatesRequest {
  /** the shipment the estimates are copied onto: one with no buying costs yet */
  shipmentId: string;
  /** the shipment whose estimated buying costs are copied */
  fromShipmentId: string;
}

interface CopyEstimatesResponse {
  /** how many buying rows were copied (0 when the other shipment has no estimate) */
  copied: number;
}

/**
 * "Copy estimated costs" of the New Shipment wizard: another shipment's estimated buying costs
 * copied onto a new one in one go, one row per row with its quantity, words and vendor - all of
 * them or none (services/estimateCopy).
 */
export const invoicingCopyEstimates = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/copy-estimates" },
  async ({ shipmentId, fromShipmentId }: CopyEstimatesRequest): Promise<CopyEstimatesResponse> => {
    return { copied: await copyEstimates(getAuthData()!.companyID, fromShipmentId, shipmentId) };
  },
);
