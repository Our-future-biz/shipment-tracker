import type { interfaces } from "@/lib/api/client";
import { surveyPhaseKey, surveyPhaseOf, type SurveyPhaseKey } from "./gate";

// The survey form's values, shared by the gate job's Survey tab and floor mode.

export type SurveyInput = interfaces.GateSurveyInput;
export type SurveyLine = interfaces.GateSurveyLine;

export const blankLine = (): SurveyLine => ({ qty: null, outerPacking: "", visual: [], inner: [] });

export const blankSurvey = (container: string, phase: SurveyPhaseKey): SurveyInput => ({
  container,
  phase: surveyPhaseOf(phase),
  damaged: 0,
  lost: 0,
  lines: [blankLine()],
  driverNote: "",
  warehouseNote: "",
});

// The phase is written in its current wording, so a legacy "Both" survey saves back as receipt.
export const pickInput = ({ surveyedAt: _at, surveyedBy: _by, ...input }: interfaces.GateSurvey): SurveyInput => ({
  ...input,
  phase: surveyPhaseOf(surveyPhaseKey(input.phase)),
});

/** A line counts as filled once it has a number of packages and an outer packing. */
export const lineFilled = (l: SurveyLine) => l.qty != null && !!l.outerPacking;

/**
 * The photo rule of a survey (the same on the gate job and in floor mode): each visual condition
 * flag needs at least one photo of that container before the survey can be printed.
 */
export function surveyPhotoCheck(lines: SurveyLine[], containerPhotos: number): { flags: number; photos: number; short: boolean; text: string } {
  const flags = lines.reduce((a, l) => a + l.visual.length, 0);
  const short = flags > 0 && containerPhotos < flags;
  return {
    flags,
    photos: containerPhotos,
    short,
    text: `Each condition flag needs at least one photo before the survey can be printed — ${flags} flag(s), ${containerPhotos} photo(s).`,
  };
}
