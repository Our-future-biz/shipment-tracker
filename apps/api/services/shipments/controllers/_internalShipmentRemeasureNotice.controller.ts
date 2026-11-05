import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { commentService } from "../services/comment.service";
import type { RemeasureFigures, RemeasureNoticeResult } from "../interfaces/interfaces";

interface RemeasureNoticeRequest {
  shipmentId: string;
  /** The totals of the warehouse's saved remeasured lines. */
  remeasured: RemeasureFigures;
  /**
   * What the warehouse's screen compared them with: "dimensions" (the totals of the shipment's
   * cargo dimension lines) or "declared" (its pieces, weight and volume).
   */
  comparedWith: string;
  /** Typed with Inform Operations; "" or left out for none. */
  note?: string;
}

/**
 * Internal API of the warehouse services: their Inform Operations posts "Cargo has been remeasured
 * by the warehouse" to the shipment's chat as the user clicking, tagging the shipment's Person in
 * Charge and Holiday Cover (resolved here). Called inside the transaction that records the time,
 * so a notice that fails records nothing.
 */
export const _internalShipmentRemeasureNotice = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/remeasure-notice" },
  async (req: RemeasureNoticeRequest): Promise<RemeasureNoticeResult> => {
    const auth = getAuthData()!;
    return commentService.postRemeasureNotice(req.shipmentId, auth.companyID, auth.userID, {
      remeasured: req.remeasured,
      comparedWith: req.comparedWith,
      note: req.note ?? "",
    });
  },
);
