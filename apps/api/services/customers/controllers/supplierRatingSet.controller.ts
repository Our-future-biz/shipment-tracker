import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { supplierRatingService } from "../services/supplierRating.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface SupplierRatingSetRequest {
  id: string;
  /** 0–5 whole stars (0 the worst), or null to clear the rating. */
  rating: number | null;
  /** Why; needed for 0, 1 or 2 stars. */
  reason?: string & MaxLen<300>;
}

interface SupplierRatingSetResponse {
  customer: CustomerItem;
}

// Managers and admins only; who and when come from the login and the server's clock, never the request.
export const supplierRatingSet = api(
  { expose: true, auth: true, method: "PUT", path: "/customers/:id/supplier-rating" },
  async ({ id, rating, reason }: SupplierRatingSetRequest): Promise<SupplierRatingSetResponse> => {
    const actor = getAuthData()!;
    return { customer: await supplierRatingService.set(actor.companyID, id, { userID: actor.userID, role: actor.role }, { rating, reason }) };
  },
);
