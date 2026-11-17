import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoiceDocumentService } from "../services/invoiceDocument.service";

interface ChargeCountRequest {
  shipmentId: string;
}

interface ChargeCountResponse {
  /** Selling lines with a value that are on an issued, not credited invoice */
  invoiced: number;
  /** Selling lines with a value, ticked for Invoice or not */
  total: number;
}

// Internal API of the shipments service: a job may be marked Invoiced only once all its charges
// are on an open invoice (lib/shipmentStatus). The company comes from the caller's auth, which
// Encore passes along on the service call.
export const _internalChargeCount = api(
  { expose: false, auth: true, method: "GET", path: "/internal/invoicing/charge-count/:shipmentId" },
  async (req: ChargeCountRequest): Promise<ChargeCountResponse> => invoiceDocumentService.chargeCount(req.shipmentId, getAuthData()!.companyID),
);
