import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { tariffService } from "../services/tariff.service";
import type { TariffDetail, ZoneBy } from "../interfaces/interfaces";
import { requireModule } from "../../../lib/modules";

interface TruckingTariffUpdateRequest {
  id: string;
  name?: string;
  /** DISCOUNT tariffs only */
  discountPercent?: number;
  zoneBy?: ZoneBy;
}

interface TruckingTariffResponse {
  tariff: TariffDetail;
}

// Renames a tariff, changes its zone postcode or (DISCOUNT) its discount (manager).
export const truckingTariffUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/trucking/tariffs/:id" },
  async ({ id, ...input }: TruckingTariffUpdateRequest): Promise<TruckingTariffResponse> => {
    await requireModule("trucking_concept");
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    return { tariff: await tariffService.update(companyID, userID, role, id, input) };
  },
);
