import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { customerPeopleService } from "../services/peopleNormalize.service";
import type { CustomerPeopleNormalizeResult } from "../interfaces/interfaces";

// Records the sales owner of every live customer and the author of every Communication note of the
// caller's company by the user's e-mail, linking an old typed name to the one user it names.
// Values that name no single user stay and are listed. Can be run again at any time. Superadmins only.
export const customerPeopleNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/customers/people/normalize" },
  async (): Promise<CustomerPeopleNormalizeResult> => {
    const actor = requireRole("superadmin");
    return customerPeopleService.normalize(actor.companyID);
  },
);
