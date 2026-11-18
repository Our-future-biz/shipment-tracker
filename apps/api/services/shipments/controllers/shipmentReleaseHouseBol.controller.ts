import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem } from "../interfaces/interfaces";

interface ReleaseHouseBolRequest {
  shipmentId: string;
  /**
   * A manager's reason (at least 3 characters) to release a job on prepayment that is not paid - or whose payment
   * could not be checked (lib/prepaymentStop). Recorded with the release; not needed, and not recorded, otherwise.
   */
  paymentOverrideReason?: string & MaxLen<500>;
}

interface ReleaseHouseBolResponse {
  shipment: ShipmentItem;
}

// Releasing the house BoL is its own action rather than a field edit: the
// record of who released it is written from the authenticated user, so it
// cannot be typed in by hand. A job on prepayment that is not paid is not released (lib/prepaymentStop),
// unless a manager gives a reason.
export const shipmentReleaseHouseBol = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/house-bol-release" },
  async (req: ReleaseHouseBolRequest): Promise<ReleaseHouseBolResponse> => {
    const auth = getAuthData()!;
    await shipmentService.requireDetailsEditor(req.shipmentId, auth);
    // A person's release is held to the prepayment stop; the app's own (see AuthData.appWrite) is not.
    const person = auth.appWrite ? undefined : { role: auth.role, paymentOverrideReason: req.paymentOverrideReason };
    return { shipment: await shipmentService.releaseHouseBol(req.shipmentId, auth.companyID, auth.userID, person) };
  },
);
