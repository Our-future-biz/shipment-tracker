import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { shipmentService } from "../services/shipment.service";
import type { ReferenceNormalizeResult } from "../interfaces/interfaces";

// The one-off rename after Internal References got the letters of their Freight Mode and Load Type
// (owner decision, 3 Nov 2026): CZ00000023 by sea, full load → CZFCL00000023, the number kept.
// Shipments that are invoiced or booked (an invoice, or a booking number: owner's answer Q33) keep
// their reference. Safe to run again. Superadmins only.
export const shipmentReferencesNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/references/normalize" },
  async (): Promise<ReferenceNormalizeResult> => {
    const actor = requireRole("superadmin");
    return shipmentService.normalizeReferences(actor.companyID, actor.userID);
  },
);
