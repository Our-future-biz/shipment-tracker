import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { tariffService } from "../services/tariff.service";
import type { TariffDetail, TariffMode, TariffScope, TariffSide, ZoneBy } from "../interfaces/interfaces";

interface TruckingTariffCreateRequest {
  side: TariffSide;
  scope: TariffScope;
  mode: TariffMode;
  name: string;
  /** BUY: the haulier; SELL: the customer, or null for the Standard list; INTERNAL: null */
  ownerCustomerId: string | null;
  currency: "CZK" | "EUR";
  zoneBy: ZoneBy;
  /** DISCOUNT only: % off the Standard list (negative = uplift) */
  discountPercent: number | null;
}

interface TruckingTariffResponse {
  tariff: TariffDetail;
}

// Creates a tariff (manager). One per side, scope and owner; a second one is refused with 409.
export const truckingTariffCreate = api(
  { expose: true, auth: true, method: "POST", path: "/trucking/tariffs" },
  async (input: TruckingTariffCreateRequest): Promise<TruckingTariffResponse> => {
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    return { tariff: await tariffService.create(companyID, userID, role, input) };
  },
);
