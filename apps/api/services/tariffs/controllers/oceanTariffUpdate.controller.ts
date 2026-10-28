import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { RailDirection } from "../interfaces/interfaces";
import { oceanTariffService, type OceanTariffFields } from "../services/oceanTariff.service";

interface OceanTariffUpdateRequest {
  tariffId: string;
  name: string & MinLen<1> & MaxLen<200>;
  /** Import, export or both */
  directions: RailDirection[] & MaxLen<2>;
}

// Changes a tariff's name and import / export (manager).
export const oceanTariffUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/tariffs/ocean/tariffs/:tariffId" },
  async ({ tariffId, ...fields }: OceanTariffUpdateRequest): Promise<OceanTariffFields> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    return oceanTariffService.update(companyID, tariffId, fields);
  },
);
