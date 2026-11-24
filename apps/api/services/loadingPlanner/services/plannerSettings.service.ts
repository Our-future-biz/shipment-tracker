import { APIError } from "encore.dev/api";
import type { Actor } from "../../../lib/rbac";
import type { PlannerSettings } from "../interfaces/interfaces";
import { canEditPlannerSettings, DEFAULT_SETTINGS, settingsProblem } from "../lib/clearance";
import { plannerSettingRepository } from "../repositories/plannerSetting.repository";
import type { PlannerSettingRecord } from "../schemas/plannerSetting.schema";

// Loading Planner → Settings (Council Review 6, K4-K6): what every plan of the company is worked
// out with - the clearance left in a standard container, the limits out-of-gauge cargo is warned
// about above, and the weights of a heavy single piece. Everybody reads them; managers and admins
// change them, and the server holds them to that whatever the screen shows.

/** The settings a stored row holds. */
export const settingsOfRow = (row: PlannerSettingRecord): PlannerSettings => ({
  clearance: { doorWidthMm: row.doorWidthMm, doorHeightMm: row.doorHeightMm, lengthMm: row.lengthMm },
  oogWarning: { widthMm: row.oogWidthMm, overEndMm: row.oogOverEndMm, heightMm: row.oogHeightMm },
  heavyPiece: { warnKg: row.heavyWarnKg, moveKg: row.heavyMoveKg },
});

/** The settings as the screen is given them. */
export interface PlannerSettingsView {
  settings: PlannerSettings;
  /** A manager changed the figures; false while the company plans with the starting ones. */
  changed: boolean;
  /** The user may change them (a manager or an admin). */
  canEdit: boolean;
}

class PlannerSettingsService {
  /** The company's settings, or the starting figures while nobody has set any. */
  async get(companyId: string, role: string): Promise<PlannerSettingsView> {
    const row = await plannerSettingRepository.get(companyId);
    return { settings: row ? settingsOfRow(row) : DEFAULT_SETTINGS, changed: row !== null, canEdit: canEditPlannerSettings(role) };
  }

  /** Saves the company's settings, whole. Refused for a plain user, and for a figure out of its range. */
  async set(actor: Actor, settings: PlannerSettings): Promise<PlannerSettingsView> {
    if (!canEditPlannerSettings(actor.role)) throw APIError.permissionDenied("Only managers and admins change the Loading Planner's settings");
    const problem = settingsProblem(settings);
    if (problem) throw APIError.invalidArgument(problem);
    // The answer is what was stored, not what was sent.
    const row = await plannerSettingRepository.save(actor.companyID, settings, actor.userID);
    return { settings: settingsOfRow(row), changed: true, canEdit: true };
  }
}

export const plannerSettingsService = new PlannerSettingsService();
