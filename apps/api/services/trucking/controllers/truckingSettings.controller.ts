import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { settingsService } from "../services/settings.service";
import type {
  ChargeableFactors,
  MarginFloor,
  ServiceLevelSetting,
  TransportOrderTexts,
  TruckingSettings,
  VehicleTypeSetting,
} from "../interfaces/interfaces";

interface TruckingSettingsResponse {
  settings: TruckingSettings;
}

// Trucking settings: service levels, vehicle types, chargeable-weight factors, margin floor and
// the transport-order e-mail texts. Everyone signed in may read them (the defaults, version 0,
// until a manager saves); only a manager changes them.
export const truckingSettingsGet = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/settings" },
  async (): Promise<TruckingSettingsResponse> => {
    return { settings: await settingsService.get(getAuthData()!.companyID) };
  },
);

interface TruckingSettingsUpdateRequest {
  /** All 8 service levels */
  serviceLevels: ServiceLevelSetting[];
  vehicleTypes: VehicleTypeSetting[];
  factors: ChargeableFactors;
  marginFloor: MarginFloor;
  transportOrder: TransportOrderTexts;
  /** The version read (0 when none is saved yet); a save on top of a newer one is refused with 409. */
  version: number;
}

export const truckingSettingsUpdate = api(
  { expose: true, auth: true, method: "PUT", path: "/trucking/settings" },
  async ({ version, ...input }: TruckingSettingsUpdateRequest): Promise<TruckingSettingsResponse> => {
    const { userID, companyID, role } = requireRole("superadmin", "admin", "manager");
    return { settings: await settingsService.update(companyID, userID, role, input, version) };
  },
);
