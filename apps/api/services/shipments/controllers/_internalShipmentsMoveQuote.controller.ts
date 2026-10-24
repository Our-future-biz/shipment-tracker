import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";

interface ShipmentsMoveQuoteRequest {
  /** The sales quote reference the shipments name now (a Won quote that was revised). */
  from: string & MinLen<1> & MaxLen<50>;
  /** Its revision, which the shipments name from now on. */
  to: string & MinLen<1> & MaxLen<50>;
}

interface ShipmentsMoveQuoteResponse {
  /** The job numbers of the shipments moved, the oldest first; none when no shipment named the quote. */
  moved: string[];
}

/**
 * Internal API of the quotes service: a Won quote was revised, and its revision takes over the
 * quote's shipments - every live shipment of the caller's company that names `from` in its Sales
 * Number names `to` instead, with a line in its history, and both quotes are told.
 */
export const _internalShipmentsMoveQuote = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/move-quote" },
  async (req: ShipmentsMoveQuoteRequest): Promise<ShipmentsMoveQuoteResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { moved: await shipmentService.moveQuoteReference(companyID, userID, req.from, req.to) };
  },
);
