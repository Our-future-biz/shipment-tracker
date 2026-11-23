// Co-Loading Concept's figures a manager sets (Council Outlay 12, D3 and D5): the share of a box's
// inside volume planned with, for the whole company, and - per service - a lower cargo weight for
// the inland leg between the port and the hub. Pure.

import { PLANNING_VOLUME_SHARE } from "../../../lib/containerCapacity";

/** The planning share a company starts with, in whole percent. */
export const DEFAULT_PLANNING_VOLUME_PCT = Math.round(PLANNING_VOLUME_SHARE * 100);
export const PLANNING_VOLUME_PCT_MIN = 50;
export const PLANNING_VOLUME_PCT_MAX = 100;

/** Why this planning share cannot be saved, as a sentence; null when it can. */
export const planningPctProblem = (pct: number): string | null =>
  Number.isInteger(pct) && pct >= PLANNING_VOLUME_PCT_MIN && pct <= PLANNING_VOLUME_PCT_MAX
    ? null
    : `The planning share must be a whole number from ${PLANNING_VOLUME_PCT_MIN} to ${PLANNING_VOLUME_PCT_MAX} percent.`;

export const INLAND_WEIGHT_MIN_KG = 1000;
export const INLAND_WEIGHT_MAX_KG = 50000;

/** Why this inland weight cannot be saved, as a sentence; null when it can. null (no inland limit) always can. */
export const inlandWeightProblem = (kg: number | null): string | null =>
  kg === null || (Number.isInteger(kg) && kg >= INLAND_WEIGHT_MIN_KG && kg <= INLAND_WEIGHT_MAX_KG)
    ? null
    : `The inland weight must be a whole number of kg from ${INLAND_WEIGHT_MIN_KG.toLocaleString("en-US")} to ${INLAND_WEIGHT_MAX_KG.toLocaleString("en-US")}, or left empty for none.`;
