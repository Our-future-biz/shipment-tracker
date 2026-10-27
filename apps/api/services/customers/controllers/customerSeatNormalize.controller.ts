import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { customerSeatService } from "../services/seatNormalize.service";
import type { CustomerSeatNormalizeResult } from "../interfaces/interfaces";

// Copies each live customer's Registered address into its registered address, city and country
// where an edit made since the customer was created never reached them. Customers without a
// Registered address are left and listed. Can be run again at any time. Superadmins only.
export const customerSeatNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/customers/seats/normalize" },
  async (): Promise<CustomerSeatNormalizeResult> => {
    const actor = requireRole("superadmin");
    return customerSeatService.normalize(actor.companyID);
  },
);
