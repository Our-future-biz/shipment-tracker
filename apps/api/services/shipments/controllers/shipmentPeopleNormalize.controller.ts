import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { shipmentService } from "../services/shipment.service";
import type { PeopleNormalizeResult } from "../interfaces/interfaces";

// The one-off conversion after people became users picked by e-mail (owner decision, 26 Oct
// 2026): names typed into the company's shipments become the matching user's e-mail. Safe to run
// again. Superadmins only.
export const shipmentPeopleNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/people/normalize" },
  async (): Promise<PeopleNormalizeResult> => {
    const actor = requireRole("superadmin");
    return shipmentService.normalizePeople(actor.companyID);
  },
);
