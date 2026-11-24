import { NO_ROAD_WEIGHT, type PlanRules } from "./containers";

// The Loading Planner Settings form (PlannerSettingsModal): every figure of the company's rules
// under one name, and what the form may save.

export type SettingsField = "doorWidthMm" | "doorHeightMm" | "lengthMm" | "oogWidthMm" | "oogOverEndMm" | "oogHeightMm" | "warnKg" | "moveKg";
/** The road-weight warnings: these two may be left empty, which means no warning. */
export type OptionalField = "gross20Kg" | "gross40Kg";
export const OPTIONAL_FIELDS: readonly OptionalField[] = ["gross20Kg", "gross40Kg"];

/** The form's figures; a field is null while the user has cleared it. */
export type SettingsDraft = Record<SettingsField | OptionalField, number | null>;

export const SETTINGS_FIELDS: readonly SettingsField[] = ["doorWidthMm", "doorHeightMm", "lengthMm", "oogWidthMm", "oogOverEndMm", "oogHeightMm", "warnKg", "moveKg"];

/** The rules as the form shows them. */
export const draftOf = (rules: PlanRules): SettingsDraft => ({
  ...rules.clearance,
  oogWidthMm: rules.oogWarning.widthMm,
  oogOverEndMm: rules.oogWarning.overEndMm,
  oogHeightMm: rules.oogWarning.heightMm,
  ...rules.heavyPiece,
  ...(rules.roadWeight ?? NO_ROAD_WEIGHT),
});

/** The rules a filled-in form holds; null while a field is empty. */
export function rulesOf(draft: SettingsDraft): PlanRules | null {
  if (SETTINGS_FIELDS.some((key) => draft[key] === null)) return null;
  const d = draft as Record<SettingsField, number>;
  return {
    clearance: { doorWidthMm: d.doorWidthMm, doorHeightMm: d.doorHeightMm, lengthMm: d.lengthMm },
    oogWarning: { widthMm: d.oogWidthMm, overEndMm: d.oogOverEndMm, heightMm: d.oogHeightMm },
    heavyPiece: { warnKg: d.warnKg, moveKg: d.moveKg },
    roadWeight: { gross20Kg: draft.gross20Kg, gross40Kg: draft.gross40Kg },
  };
}

/** The form holds the stored figures: there is nothing to save. */
export const sameAsStored = (draft: SettingsDraft, rules: PlanRules): boolean => {
  const stored = draftOf(rules);
  return [...SETTINGS_FIELDS, ...OPTIONAL_FIELDS].every((key) => draft[key] === stored[key]);
};

/** "Move from" is below "Warn from": a piece would leave standard containers before it is warned about. */
export const heavyOrderWrong = (rules: PlanRules | null): boolean => rules !== null && rules.heavyPiece.moveKg < rules.heavyPiece.warnKg;
