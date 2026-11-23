import { APIError, api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { PlannerSettings } from "../interfaces/interfaces";
import { canEditPlannerSettings, DEFAULT_SETTINGS, settingsProblem } from "../lib/clearance";
import { plannerSettingRepository, settingsOfRow } from "../repositories/plannerSetting.repository";

// Loading Planner → Settings (Council Review 6, K4-K6): what every plan of the company is worked
// out with - the clearance left in a standard container, the limits out-of-gauge cargo is warned
// about above, and the weights of a heavy single piece. Everybody reads them and managers and
// admins change them.

interface PlannerSettingsResponse {
  settings: PlannerSettings;
  /** A manager changed the figures; false while the company plans with the starting ones. */
  changed: boolean;
  canEdit: boolean;
}

async function settingsOf(companyId: string, role: string): Promise<PlannerSettingsResponse> {
  const row = await plannerSettingRepository.get(companyId);
  return { settings: row ? settingsOfRow(row) : DEFAULT_SETTINGS, changed: row !== null, canEdit: canEditPlannerSettings(role) };
}

export const plannerSettingsGet = api(
  { expose: true, auth: true, method: "GET", path: "/loading-planner/settings" },
  async (): Promise<PlannerSettingsResponse> => {
    const auth = getAuthData()!;
    return settingsOf(auth.companyID, auth.role);
  },
);

interface PlannerSettingsSetRequest {
  settings: PlannerSettings;
}

export const plannerSettingsSet = api(
  { expose: true, auth: true, method: "PUT", path: "/loading-planner/settings" },
  async ({ settings }: PlannerSettingsSetRequest): Promise<PlannerSettingsResponse> => {
    const auth = getAuthData()!;
    if (!canEditPlannerSettings(auth.role)) throw APIError.permissionDenied("Only managers and admins change the Loading Planner's settings");
    const problem = settingsProblem(settings);
    if (problem) throw APIError.invalidArgument(problem);
    await plannerSettingRepository.save(auth.companyID, settings, auth.userID);
    return settingsOf(auth.companyID, auth.role);
  },
);
