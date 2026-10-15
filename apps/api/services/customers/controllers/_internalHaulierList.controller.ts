import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { HaulierCompanyItem } from "../interfaces/interfaces";

interface HaulierListRequest {
  /** Only these customers (those of them that are live hauliers); every haulier when left out. */
  ids?: string[];
}

interface HaulierListResponse {
  /** Live companies with the role "haulier", by company name. */
  hauliers: HaulierCompanyItem[];
}

/**
 * Internal API of the trucking service: the hauliers (subcontracted carriers) of the caller's
 * company, a few fields each, so it can list them with their trucking profile and check that a
 * company it is asked about really is a haulier.
 */
export const _internalHaulierList = api(
  { expose: false, auth: true, method: "GET", path: "/internal/customers/hauliers" },
  async ({ ids }: HaulierListRequest): Promise<HaulierListResponse> => {
    return { hauliers: await customerService.haulierList(getAuthData()!.companyID, ids) };
  },
);
