import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { fuelIndexService } from "../services/fuelIndex.service";
import type { FuelIndexMonth } from "../interfaces/interfaces";
import { requireModule } from "../../../lib/modules";

interface TruckingFuelIndexResponse {
  /** Newest first */
  months: FuelIndexMonth[];
}

// The fuel surcharge % per month, read by tariff surcharges with the calc FUEL_INDEX.
export const truckingFuelIndexList = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/fuel-index" },
  async (): Promise<TruckingFuelIndexResponse> => {
    await requireModule("trucking_concept");
    return { months: await fuelIndexService.list(getAuthData()!.companyID) };
  },
);

interface TruckingFuelIndexSetRequest {
  /** "YYYY-MM" */
  month: string;
  /** 0..100 */
  percent: number;
}

// Sets one month's % (manager); a month already set is overwritten.
export const truckingFuelIndexSet = api(
  { expose: true, auth: true, method: "PUT", path: "/trucking/fuel-index" },
  async ({ month, percent }: TruckingFuelIndexSetRequest): Promise<TruckingFuelIndexResponse> => {
    await requireModule("trucking_concept");
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    return { months: await fuelIndexService.set(companyID, userID, role, month, percent) };
  },
);
