import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { truckingRealService } from "../services/truckingReal.service";
import type { TruckingRealLine, TruckingRealResult } from "../interfaces/interfaces";

interface TruckingRealRequest {
  shipmentId: string;
  /** "trucking:trip:<id>", "trucking:trip:<id>:job:<shipmentId>" or "trucking:leg:<id>" (buying rows) */
  sourceRef: string;
  /** One per live row of the sourceRef, in the rows' order; empty clears the real side */
  realLines: TruckingRealLine[];
}

/**
 * Internal API of the trucking service: the real cost of the buying rows a trip or partner
 * delivery keeps on its job, from an approved haulier invoice (real amount, currency, the
 * haulier's invoice number, received).
 */
export const _internalInvoicingTruckingReal = api(
  { expose: false, auth: true, method: "PUT", path: "/internal/invoicing/trucking-real" },
  async (req: TruckingRealRequest): Promise<TruckingRealResult> => {
    return truckingRealService.setReal(getAuthData()!.companyID, req);
  },
);
