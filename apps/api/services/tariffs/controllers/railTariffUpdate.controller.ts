import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { RailDirection, TariffPortCode } from "../interfaces/interfaces";
import { railTariffService } from "../services/railTariff.service";

interface RailTariffUpdateRequest {
  tariffId: string;
  name: string & MinLen<1> & MaxLen<200>;
  /** At least one */
  ports: TariffPortCode[] & MaxLen<10>;
  /** Import, export or both */
  directions: RailDirection[] & MaxLen<2>;
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
  { expose: true, auth: true, method: "PATCH", path: "/tariffs/rail/tariffs/:tariffId" },
  async ({ tariffId, ...fields }: RailTariffUpdateRequest): Promise<RailTariffUpdateResponse> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    return railTariffService.update(companyID, tariffId, fields);
  },
);
