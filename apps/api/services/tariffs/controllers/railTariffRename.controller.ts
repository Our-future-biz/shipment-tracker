import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { RailDirection, TariffPortCode } from "../interfaces/interfaces";
import { railTariffService } from "../services/railTariff.service";

interface RailTariffUpdateRequest {
  id: string;
  name: string & MinLen<1> & MaxLen<200>;
  /** At least one */
  ports: TariffPortCode[];
  /** Import, export or both */
  directions: RailDirection[];
}

interface RailTariffUpdateResponse {
  id: string;
  name: string;
  ports: TariffPortCode[];
  directions: RailDirection[];
}

// Changes a tariff (manager): its name, e.g. the one the AI suggested, the ports it is for and
// whether it is import, export or both.
export const railTariffUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/tariffs/rail/tariffs/:id" },
  async ({ id, ...fields }: RailTariffUpdateRequest): Promise<RailTariffUpdateResponse> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    return railTariffService.update(companyID, id, fields);
  },
);
