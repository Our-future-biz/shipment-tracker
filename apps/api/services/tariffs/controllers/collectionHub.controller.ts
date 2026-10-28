import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { CollectionFreightMode, CollectionHub } from "../interfaces/interfaces";
import { collectionTariffService } from "../services/collectionTariff.service";

interface CollectionHubsResponse {
  /** One per freight mode that has one */
  hubs: CollectionHub[];
}

// Our hubs: where a freight mode's collections end and deliveries start.
export const collectionHubList = api(
  { expose: true, auth: true, method: "GET", path: "/tariffs/collections/hubs" },
  async (): Promise<CollectionHubsResponse> => {
    return { hubs: await collectionTariffService.hubs(getAuthData()!.companyID) };
  },
);

interface CollectionHubSetRequest {
  freightMode: CollectionFreightMode;
  /** 5 digits, e.g. "25261" or "252 61" */
  postcode: string & MaxLen<20>;
  /** ISO 3166-1 alpha-2 */
  country: string & MaxLen<10>;
  label: string & MaxLen<100>;
}

// Sets our hub for a freight mode (manager): where its collections end and deliveries start.
export const collectionHubSet = api(
  { expose: true, auth: true, method: "PUT", path: "/tariffs/collections/hubs" },
  async (req: CollectionHubSetRequest): Promise<CollectionHub> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return collectionTariffService.setHub(actor, req);
  },
);
