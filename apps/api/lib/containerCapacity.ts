// What a container takes, by the container types quotes, shipments and Co-Loading sailings use:
// its volume and the weight of the cargo. One table for the fill of a box (Co-Loading Concept →
// Box utilization, Council Outlay 12).
//
// Volume: the inside volume, worked out from the inside sizes the Loading Planner holds
// (apps/web/src/app/loading-planner/_lib/containers.ts), and a planning volume - the share of it
// mixed cargo really fills. The reefers and the 20' high-cube open top have no sizes in the app
// yet and a flat rack has no walls: none of them has a volume here (decision D18).
//
// Weight: the limits Sales warns by (apps/web/src/app/sales/_lib/containerWeight.ts): `standardKg`
// any box of the type takes, `heavyTestedKg` a heavy-tested box takes (types that have such
// boxes), `maxKg` the most the type can ever take. Keep the two tables alike (decision D4).

import { containerType } from "./containerTares";

/** The share of a box's inside volume planned with: mixed LCL cargo leaves gaps and unused height (decision D2). */
export const PLANNING_VOLUME_SHARE = 0.85;

export interface ContainerCapacity {
  /** The container type as the dictionary names it: "40' HC". */
  containerType: string;
  /** The inside volume in cbm; null for a type whose volume is not known or not measured. */
  insideCbm: number | null;
  /** The volume a box is planned to: the inside volume × the planning share. */
  planningCbm: number | null;
  standardKg: number;
  heavyTestedKg: number | null;
  maxKg: number;
}

interface Row {
  insideCbm?: number;
  standardKg: number;
  heavyTestedKg?: number;
  maxKg: number;
}

const CAPACITY: Record<string, Row> = {
  "20' DC": { insideCbm: 33.1, standardKg: 26200, heavyTestedKg: 28000, maxKg: 28250 },
  "40' DC": { insideCbm: 67.5, standardKg: 26500, heavyTestedKg: 28500, maxKg: 28500 },
  "40' HC": { insideCbm: 76.4, standardKg: 26200, heavyTestedKg: 28400, maxKg: 28400 },
  "45' HQ": { insideCbm: 86.0, standardKg: 27700, heavyTestedKg: 28800, maxKg: 28800 },
  "20' OT": { insideCbm: 32.9, standardKg: 28000, maxKg: 30050 },
  "40' OT": { insideCbm: 67.3, standardKg: 26600, maxKg: 28550 },
  "40' HOT": { insideCbm: 75.7, standardKg: 28250, maxKg: 28650 },
  "20' HOT": { standardKg: 27570, maxKg: 27970 },
  "20' RF": { standardKg: 27470, maxKg: 29140 },
  "40' HRF": { standardKg: 27600, maxKg: 29000 },
  "20' FR": { standardKg: 31250, maxKg: 42100 },
  "40' FR": { standardKg: 47100, maxKg: 47400 },
  "40' HFR": { standardKg: 47300, maxKg: 49100 },
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** What a container of this type takes; null for a type the table does not have. */
export function containerCapacity(type: string | null | undefined, planningShare = PLANNING_VOLUME_SHARE): ContainerCapacity | null {
  const key = containerType(type);
  if (!Object.hasOwn(CAPACITY, key)) return null;
  const row = CAPACITY[key]!;
  const insideCbm = row.insideCbm ?? null;
  return {
    containerType: key,
    insideCbm,
    planningCbm: insideCbm === null ? null : round1(insideCbm * planningShare),
    standardKg: row.standardKg,
    heavyTestedKg: row.heavyTestedKg ?? null,
    maxKg: row.maxKg,
  };
}

/** The container types the table knows. */
export const CAPACITY_CONTAINER_TYPES = Object.keys(CAPACITY);
