import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { partyLinksService } from "../services/partyLinks.service";
import type { LinksNormalizeResult } from "../interfaces/interfaces";

// The one-off backfill after shipments started keeping the Customer Database ids of their
// contacts (owner decision, 26 Oct 2026): the company's shipments and master jobs take the current
// names of the customers they link to, and a Customer's PIC or Shipper / Consignee Contact stored
// by name is linked to that contact. Safe to run again. Superadmins only.
export const shipmentLinksNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/links/normalize" },
  async (): Promise<LinksNormalizeResult> => {
    const actor = requireRole("superadmin");
    return partyLinksService.normalizeLinks(actor.companyID);
  },
);
