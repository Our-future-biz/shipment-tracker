import { containerType } from "@/lib/cargo";

// How much cargo a container takes, by type: up to the standard limit any box of the type does;
// above it a heavy-tested box is needed (dry boxes); past that - or, for a reefer, open top or
// flat rack, past the standard limit - the shipping line has to confirm it, up to the most the
// type can take at all. Agreed figures in kg of cargo per box (the KG / CONTAINER of a quote's
// container line).

interface WeightLimit {
  /** Up to this any box of the type takes the cargo. */
  standard: number;
  /** Up to this a heavy-tested box takes it; a type without heavy-tested boxes (reefers, open tops, flat racks) has none. */
  heavyTested?: number;
  /** Above this the type can't take it; below it, past the heavy-tested figure, the shipping line has to confirm it. */
  max: number;
}

const WEIGHT_LIMITS: Record<string, WeightLimit> = {
  "20' DC": { standard: 26200, heavyTested: 28000, max: 28250 },
  "40' DC": { standard: 26500, heavyTested: 28500, max: 28500 },
  "40' HC": { standard: 26200, heavyTested: 28400, max: 28400 },
  "45' HQ": { standard: 27700, heavyTested: 28800, max: 28800 },
  "20' RF": { standard: 27470, max: 29140 },
  "40' HRF": { standard: 27600, max: 29000 },
  "20' OT": { standard: 28000, max: 30050 },
  "20' HOT": { standard: 27570, max: 27970 },
  "20' FR": { standard: 31250, max: 42100 },
  "40' OT": { standard: 26600, max: 28550 },
  "40' HOT": { standard: 28250, max: 28650 },
  "40' FR": { standard: 47100, max: 47400 },
  "40' HFR": { standard: 47300, max: 49100 },
};

/**
 * Where a container's cargo weight stands: within the standard limit (no colour), needing a
 * heavy-tested box (yellow), so heavy the shipping line has to confirm it (yellow), or too heavy
 * for the type (red).
 */
export type WeightLevel = "standard" | "heavyTested" | "confirm" | "tooHeavy";

export interface WeightCheck {
  /** The limits shown under the line: standard, and the most the type takes. */
  standard: number;
  max: number;
  /** Whether the type comes heavy tested: the most it takes is then called "Heavy tested", else "Max". */
  heavyTested: boolean;
  level: WeightLevel;
}

/** The weight limits of a container type and where `weight` (kg of cargo per box) stands; null for a type without limits. */
export function checkContainerWeight(type: string | undefined, weight: number | undefined): WeightCheck | null {
  // A box saved as "20' GP" is the "20' DC" of today.
  const key = containerType(type);
  const limit = Object.hasOwn(WEIGHT_LIMITS, key) ? WEIGHT_LIMITS[key] : undefined;
  if (!limit) return null;
  const kg = Number(weight) || 0;
  const level: WeightLevel =
    kg <= limit.standard ? "standard"
    : limit.heavyTested !== undefined && kg <= limit.heavyTested ? "heavyTested"
    : kg <= limit.max ? "confirm"
    : "tooHeavy";
  return { standard: limit.standard, max: limit.max, heavyTested: limit.heavyTested !== undefined, level };
}
