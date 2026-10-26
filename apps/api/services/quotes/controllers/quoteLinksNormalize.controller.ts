import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { quoteLinksService } from "../services/quoteLinks.service";
import type { QuoteLinksNormalizeResult } from "../interfaces/interfaces";

// Brings the customer and contact copies of every open sales quote of the caller's company up to
// date with the Customer Database, linking an old contact name to the one contact it names. Values
// that cannot be linked stay and are listed. Can be run again at any time. Superadmins only.
export const quoteLinksNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/quotes/links/normalize" },
  async (): Promise<QuoteLinksNormalizeResult> => {
    const actor = requireRole("superadmin");
    return quoteLinksService.normalize(actor.companyID);
  },
);
