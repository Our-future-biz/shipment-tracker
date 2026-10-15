import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { truckingLinesService } from "../services/truckingLines.service";
import type { TruckingCostLine, TruckingLinesResult } from "../interfaces/interfaces";

interface TruckingLinesRequest {
  shipmentId: string;
  /** "trucking:consignment:<id>" (selling lines) or "trucking:trip:<id>" (buying lines) */
  sourceRef: string;
  buying: TruckingCostLine[];
  selling: TruckingCostLine[];
}

/**
 * Internal API of the trucking service: replaces the Costs Breakdown rows a consignment or trip
 * keeps on its job (soft delete + insert in one transaction). Selling rows already on an issued
 * invoice are kept as they are and counted in the answer. Empty lists remove the rows.
 */
export const _internalInvoicingTruckingLines = api(
  { expose: false, auth: true, method: "PUT", path: "/internal/invoicing/trucking-lines" },
  async (req: TruckingLinesRequest): Promise<TruckingLinesResult> => {
    return truckingLinesService.replace(getAuthData()!.companyID, req);
  },
);
