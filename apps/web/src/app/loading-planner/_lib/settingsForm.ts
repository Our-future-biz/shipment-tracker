import type { PlanRules } from "./containers";

// The Loading Planner Settings form (PlannerSettingsModal): every figure of the company's rules
// under one name, and what the form may save.

export type SettingsField = "doorWidthMm" | "doorHeightMm" | "lengthMm" | "oogWidthMm" | "oogOverEndMm" | "oogHeightMm" | "warnKg" | "moveKg";

/** The form's figures; a field is null while the user has cleared it. */
export type SettingsDraft = Record<SettingsField, number | null>;

export const SETTINGS_FIELDS: readonly SettingsField[] = ["doorWidthMm", "doorHeightMm", "lengthMm", "oogWidthMm", "oogOverEndMm", "oogHeightMm", "warnKg", "moveKg"];

/** The rules as the form shows them. */
export const draftOf = (rules: PlanRules): SettingsDraft => ({
  ...rules.clearance,
  oogWidthMm: rules.oogWarning.widthMm,
  oogOverEndMm: rules.oogWarning.overEndMm,
  oogHeightMm: rules.oogWarning.heightMm,
  ...rules.heavyPiece,
});

/** The rules a filled-in form holds; null while a field is empty. */
export function rulesOf(draft: SettingsDraft): PlanRules | null {
  if (SETTINGS_FIELDS.some((key) => draft[key] === null)) return null;
  const d = draft as Record<SettingsField, number>;
  return {
    clearance: { doorWidthMm: d.doorWidthMm, doorHeightMm: d.doorHeightMm, lengthMm: d.lengthMm },
    oogWarning: { widthMm: d.oogWidthMm, overEndMm: d.oogOverEndMm, heightMm: d.oogHeightMm },
    heavyPiece: { warnKg: d.warnKg, moveKg: d.moveKg },
  };
}

/** The form holds the stored figures: there is nothing to save. */
export const sameAsStored = (draft: SettingsDraft, rules: PlanRules): boolean => {
  const stored = draftOf(rules);
  return SETTINGS_FIELDS.every((key) => draft[key] === stored[key]);
};

/** "Move from" is below "Warn from": a piece would leave standard containers before it is warned about. */
export const heavyOrderWrong = (rules: PlanRules | null): boolean => rules !== null && rules.heavyPiece.moveKg < rules.heavyPiece.warnKg;
