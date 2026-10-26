import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { followupLinksService } from "../services/followupLinks.service";
import type { SalesLinksNormalizeResult } from "../interfaces/interfaces";

// Brings the customer name of every follow-up task of the caller's company that is linked to a
// customer record up to date with the Customer Database. Tasks linked to a deleted customer keep
// their name and are listed. Can be run again at any time. Superadmins only.
export const salesLinksNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/sales/links/normalize" },
  async (): Promise<SalesLinksNormalizeResult> => {
    const actor = requireRole("superadmin");
    return followupLinksService.normalize(actor.companyID);
  },
);
