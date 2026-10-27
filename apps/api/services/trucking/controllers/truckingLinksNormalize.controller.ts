import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { customerLinksService } from "../services/customerLinks.service";
import type { TruckingLinksNormalizeResult } from "../interfaces/interfaces";

// The one-off backfill after copies became linked (owner, 26 Oct 2026): the customer names of the
// company's consignments and the haulier names of its trips are refreshed from the Customer
// Database by their ids. Safe to run again. Superadmins only.
export const truckingLinksNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/links/normalize" },
  async (): Promise<TruckingLinksNormalizeResult> => {
    const actor = requireRole("superadmin");
    return customerLinksService.normalize(actor.companyID);
  },
);
