import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { PlannerSettings } from "../interfaces/interfaces";
import { plannerSettingsService } from "../services/plannerSettings.service";

// Loading Planner → Settings (Council Review 6, K4-K6): what every plan of the company is worked
// out with. Everybody reads them and managers and admins change them (plannerSettings.service).

interface PlannerSettingsResponse {
  settings: PlannerSettings;
  /** A manager changed the figures; false while the company plans with the starting ones. */
  changed: boolean;
  canEdit: boolean;
}

export const plannerSettingsGet = api(
  { expose: true, auth: true, method: "GET", path: "/loading-planner/settings" },
  async (): Promise<PlannerSettingsResponse> => {
    const { companyID, role } = getAuthData()!;
    return plannerSettingsService.get(companyID, role);
  },
);

interface PlannerSettingsSetRequest {
  settings: PlannerSettings;
}

export const plannerSettingsSet = api(
  { expose: true, auth: true, method: "PUT", path: "/loading-planner/settings" },
  async ({ settings }: PlannerSettingsSetRequest): Promise<PlannerSettingsResponse> => {
    return plannerSettingsService.set(getAuthData()!, settings);
  },
);
