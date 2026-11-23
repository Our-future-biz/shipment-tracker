import { APIError, api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { PlannerClearance } from "../interfaces/interfaces";
import { canEditPlannerSettings, clearanceProblem, DEFAULT_CLEARANCE } from "../lib/clearance";
import { plannerSettingRepository } from "../repositories/plannerSetting.repository";

// Loading Planner → Settings (Council Review 6, K4): the clearance every plan of the company leaves
// in a standard container. Everybody reads it - every plan is worked out with it - and managers
// and admins change it.

interface PlannerSettingsResponse {
  clearance: PlannerClearance;
  /** A manager changed the figures; false while the company plans with the starting ones. */
  changed: boolean;
  canEdit: boolean;
}

async function settingsOf(companyId: string, role: string): Promise<PlannerSettingsResponse> {
  const row = await plannerSettingRepository.get(companyId);
  return {
    clearance: row ? { doorWidthMm: row.doorWidthMm, doorHeightMm: row.doorHeightMm, lengthMm: row.lengthMm } : DEFAULT_CLEARANCE,
    changed: row !== null,
    canEdit: canEditPlannerSettings(role),
  };
}

export const plannerSettingsGet = api(
  { expose: true, auth: true, method: "GET", path: "/loading-planner/settings" },
  async (): Promise<PlannerSettingsResponse> => {
    const auth = getAuthData()!;
    return settingsOf(auth.companyID, auth.role);
  },
);

interface PlannerSettingsSetRequest {
  clearance: PlannerClearance;
}

export const plannerSettingsSet = api(
  { expose: true, auth: true, method: "PUT", path: "/loading-planner/settings" },
  async ({ clearance }: PlannerSettingsSetRequest): Promise<PlannerSettingsResponse> => {
    const auth = getAuthData()!;
    if (!canEditPlannerSettings(auth.role)) throw APIError.permissionDenied("Only managers and admins change the Loading Planner's settings");
    const problem = clearanceProblem(clearance);
    if (problem) throw APIError.invalidArgument(problem);
    await plannerSettingRepository.save(auth.companyID, clearance, auth.userID);
    return settingsOf(auth.companyID, auth.role);
  },
);
