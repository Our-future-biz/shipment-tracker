import type { PlannerSettings } from "../interfaces/interfaces";

/** The most a clearance figure may be, in mm. */
export const MAX_CLEARANCE_MM = 500;

/**
 * What a company plans with until a manager sets its own (Council Review 6: K4 clearance, K5
 * out-of-gauge warnings, K6 heavy single pieces).
 */
export const DEFAULT_SETTINGS: PlannerSettings = {
  clearance: { doorWidthMm: 50, doorHeightMm: 50, lengthMm: 100 },
  oogWarning: { widthMm: 3500, overEndMm: 1000, heightMm: 3200 },
  heavyPiece: { warnKg: 5000, moveKg: 10000 },
};

/** Roles that set the planner's figures; everyone reads them. */
export const canEditPlannerSettings = (role: string): boolean => role === "manager" || role === "admin" || role === "superadmin";

interface Rule {
  value: number;
  name: string;
  unit: string;
  min: number;
  max: number;
}

const rulesOf = ({ clearance, oogWarning, heavyPiece }: PlannerSettings): Rule[] => [
  { value: clearance.doorWidthMm, name: "clearance on door width", unit: "mm", min: 0, max: MAX_CLEARANCE_MM },
  { value: clearance.doorHeightMm, name: "clearance on door height", unit: "mm", min: 0, max: MAX_CLEARANCE_MM },
  { value: clearance.lengthMm, name: "clearance on length", unit: "mm", min: 0, max: MAX_CLEARANCE_MM },
  { value: oogWarning.widthMm, name: "out-of-gauge width", unit: "mm", min: 2400, max: 10000 },
  { value: oogWarning.overEndMm, name: "out-of-gauge overhang per end", unit: "mm", min: 0, max: 10000 },
  { value: oogWarning.heightMm, name: "out-of-gauge cargo height", unit: "mm", min: 2000, max: 10000 },
  { value: heavyPiece.warnKg, name: "weight a heavy piece is warned about from", unit: "kg", min: 500, max: 35000 },
  { value: heavyPiece.moveKg, name: "weight a heavy piece leaves standard containers from", unit: "kg", min: 500, max: 35000 },
];

const figure = (value: number) => value.toLocaleString("en-US");

/** Why these settings cannot be saved, as a sentence; null when they can. */
export function settingsProblem(settings: PlannerSettings): string | null {
  for (const rule of rulesOf(settings)) {
    if (!Number.isInteger(rule.value) || rule.value < rule.min || rule.value > rule.max) {
      return `The ${rule.name} must be a whole number of ${rule.unit} from ${figure(rule.min)} to ${figure(rule.max)}.`;
    }
  }
  if (settings.heavyPiece.moveKg < settings.heavyPiece.warnKg) return "The weight a heavy piece leaves standard containers from cannot be below the weight it is warned about from.";
  return null;
}
