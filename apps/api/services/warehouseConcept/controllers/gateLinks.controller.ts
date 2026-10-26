import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { gatePartiesService } from "../services/gateParties.service";

interface GateLinksNormalizeResponse {
  /** Live gate records linked to a shipment that were looked at. */
  checked: number;
  /** Records whose Customer or Customer contact was brought up to date. */
  changed: number;
  /** Shipments not brought up to date: "shipment deleted" / "shipment could not be read", by job number and position. */
  unmatched: { field: string; value: string; count: number }[];
}

// One-time backfill (superadmin, own company): gate records take their shipment's current Customer
// and Customer's PIC. Afterwards the shipment-parties-changed event keeps them current, and the
// customs follow's regular read of open records catches what an event missed. Safe to run again.
export const gateLinksNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/links/normalize" },
  async (): Promise<GateLinksNormalizeResponse> => {
    const actor = requireRole("superadmin");
    return gatePartiesService.normalize(actor.companyID);
  },
);
