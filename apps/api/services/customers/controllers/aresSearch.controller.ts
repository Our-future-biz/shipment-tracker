import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { MaxLen } from "encore.dev/validate";
import { aresService } from "../services/ares.service";
import type { AresSearchHit } from "../interfaces/interfaces";

interface AresSearchRequest {
  /** Part of the company name; at least 3 characters. */
  name: string & MaxLen<200>;
}

interface AresSearchResponse {
  companies: AresSearchHit[];
  /** True when the name fits too many companies to list; nothing is returned then. */
  tooMany: boolean;
}

// Czech companies by name, for picking one in Add Customer before it is looked up by IČO.
export const aresSearch = api(
  { expose: true, auth: true, method: "GET", path: "/ares-search" },
  async ({ name }: AresSearchRequest): Promise<AresSearchResponse> => {
    return aresService.search(getAuthData()!.companyID, name);
  },
);
