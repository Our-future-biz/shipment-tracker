import type { PlannerClearance } from "../interfaces/interfaces";

/** The most a clearance figure may be, in mm. */
export const MAX_CLEARANCE_MM = 500;

/** What a company plans with until a manager sets its own (Council Review 6, K4). */
export const DEFAULT_CLEARANCE: PlannerClearance = { doorWidthMm: 50, doorHeightMm: 50, lengthMm: 100 };

/** Roles that set the planner's figures; everyone reads them. */
export const canEditPlannerSettings = (role: string): boolean => role === "manager" || role === "admin" || role === "superadmin";

const FIGURES: [keyof PlannerClearance, string][] = [
  ["doorWidthMm", "door width"],
  ["doorHeightMm", "door height"],
  ["lengthMm", "length"],
];

/** Why these figures cannot be saved, as a sentence; null when they can. */
export function clearanceProblem(clearance: PlannerClearance): string | null {
  for (const [key, name] of FIGURES) {
    const value = clearance[key];
    if (!Number.isInteger(value) || value < 0 || value > MAX_CLEARANCE_MM) return `The clearance on ${name} must be a whole number of mm from 0 to ${MAX_CLEARANCE_MM}.`;
  }
  return null;
}
