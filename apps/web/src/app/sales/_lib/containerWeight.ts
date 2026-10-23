// How much cargo a container takes, by type: up to the standard limit any box of the type does;
// above it a heavy-tested box is needed; past the heavy-tested figure the shipping line has to
// confirm it, up to the most the type can take at all. Agreed figures in kg of cargo per box
// (the KG / CONTAINER of a quote's container line); the other equipment has none yet.

interface WeightLimit {
  /** Up to this any box of the type takes the cargo. */
  standard: number;
  /** Up to this a heavy-tested box takes it. */
  heavyTested: number;
  /** Above this the type can't take it; between heavyTested and this the shipping line has to confirm it. */
  max: number;
}

const WEIGHT_LIMITS: Record<string, WeightLimit> = {
  "20' GP": { standard: 26200, heavyTested: 28000, max: 28250 },
  "40' GP": { standard: 26500, heavyTested: 28500, max: 28500 },
  "40' HC": { standard: 26200, heavyTested: 28400, max: 28400 },
  "45' HQ": { standard: 27700, heavyTested: 28800, max: 28800 },
};

/**
 * Where a container's cargo weight stands: within the standard limit (no colour), needing a
 * heavy-tested box (yellow), past the heavy-tested figure so the shipping line has to confirm it
 * (yellow), or too heavy for the type (red).
 */
export type WeightLevel = "standard" | "heavyTested" | "confirm" | "tooHeavy";

export interface WeightCheck {
  /** The limits shown under the line: standard, and heavy tested up to the most the type takes. */
  standard: number;
  heavyTested: number;
  level: WeightLevel;
}

/** The weight limits of a container type and where `weight` (kg of cargo per box) stands; null for a type without limits. */
export function checkContainerWeight(type: string | undefined, weight: number | undefined): WeightCheck | null {
  const limit = Object.hasOwn(WEIGHT_LIMITS, (type ?? "").trim()) ? WEIGHT_LIMITS[(type ?? "").trim()] : undefined;
  if (!limit) return null;
  const kg = Number(weight) || 0;
  const level: WeightLevel =
    kg <= limit.standard ? "standard" : kg <= limit.heavyTested ? "heavyTested" : kg <= limit.max ? "confirm" : "tooHeavy";
  return { standard: limit.standard, heavyTested: limit.max, level };
}
