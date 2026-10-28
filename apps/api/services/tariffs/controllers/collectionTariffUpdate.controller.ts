import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { CollectionFreightMode } from "../interfaces/interfaces";
import { collectionTariffService, type CollectionTariffFields } from "../services/collectionTariff.service";

interface CollectionTariffUpdateRequest {
  tariffId: string;
  name: string & MinLen<1> & MaxLen<200>;
  /** At least one */
  freightModes: CollectionFreightMode[] & MaxLen<2>;
}

// Changes a tariff's name and what it collects and delivers (manager).
export const collectionTariffUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/tariffs/collections/tariffs/:tariffId" },
  async ({ tariffId, ...fields }: CollectionTariffUpdateRequest): Promise<CollectionTariffFields> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    return collectionTariffService.update(companyID, tariffId, fields);
  },
);
