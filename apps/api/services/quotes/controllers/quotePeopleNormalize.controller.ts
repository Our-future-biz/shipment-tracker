import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { quotePeopleService } from "../services/peopleNormalize.service";
import type { QuotePeopleNormalizeResult } from "../interfaces/interfaces";

// Records the owner of every live sales quote of the caller's company by the owner user's e-mail,
// linking an old typed name to the one user it names. Values that name no single user stay and
// are listed. Can be run again at any time. Superadmins only.
export const quotePeopleNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/quotes/people/normalize" },
  async (): Promise<QuotePeopleNormalizeResult> => {
    const actor = requireRole("superadmin");
    return quotePeopleService.normalize(actor.companyID);
  },
);
