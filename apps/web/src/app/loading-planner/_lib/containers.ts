// The equipment the Loading Planner can load. Sizes in mm, weights in kg.
//
// Names follow the app's container dictionary (lib/cargo.ts) where it has the type; the 20' high
// cube and the hard-tops are not in that dictionary and keep their own names.

/** How a container is loaded, which is also the order the planner prefers them in. */
export type ContainerGroup = "standard" | "open-top" | "flat-rack";

export interface ContainerSpec {
  id: string;
  name: string;
  group: ContainerGroup;
  /** Nominal length in feet: 20, 40 or 45. */
  feet: number;
  internalL: number;
  internalW: number;
  /** Inside height; on a flat rack the height of the end walls. */
  internalH: number;
  /** Door opening; null on a flat rack, which has no door. */
  doorW: number | null;
  doorH: number | null;
  /** The cargo weight the planner loads up to. */
  payloadKg: number;
  /** How much weight the floor carries on a given length of it. */
  floor: FloorStrength;
  /** A hard-top: loaded like an open top, but the planner picks a plain open top when it can. */
  hardTop?: true;
  /** Offered by few trades: the planner takes it only when it is nominated. */
  onRequest?: true;
  /** The company's rules the container is planned with (containersWith): */
  /** the room to leave free in a standard container, */
  clear?: Clearance;
  /** the weights of a heavy single piece in a standard container, */
  heavy?: HeavyPiece;
  /** and the limits cargo on an open top or flat rack is warned about above. */
  oog?: OogWarning;
}

/** Out-of-gauge cargo on an open top or flat rack is warned about above these, in whole mm. */
export interface OogWarning {
  widthMm: number;
  /** Over one end of a flat rack. */
  overEndMm: number;
  /** The cargo's height above the floor. */
  heightMm: number;
}

/** A single piece in a standard container, in whole kg. */
export interface HeavyPiece {
  /** Above this the plan says to check how the piece is stuffed. */
  warnKg: number;
  /** Above this the piece is planned onto an open top or flat rack instead. */
  moveKg: number;
}

/** What a company's plans are worked out with. Managers set it (Loading Planner, Settings). */
export interface PlanRules {
  clearance: Clearance;
  oogWarning: OogWarning;
  heavyPiece: HeavyPiece;
}

/** The room the planner leaves free in a standard container, in whole mm. Managers set it per company. */
export interface Clearance {
  /** Beside a piece passing the door. */
  doorWidthMm: number;
  /** Above a piece passing the door. */
  doorHeightMm: number;
  /** Along the floor, between the cargo and the doors. */
  lengthMm: number;
}

export const NO_CLEARANCE: Clearance = { doorWidthMm: 0, doorHeightMm: 0, lengthMm: 0 };
/** What a company plans with until a manager sets its own; the server holds the same figures. */
export const DEFAULT_CLEARANCE: Clearance = { doorWidthMm: 50, doorHeightMm: 50, lengthMm: 100 };
export const DEFAULT_RULES: PlanRules = {
  clearance: DEFAULT_CLEARANCE,
  oogWarning: { widthMm: 3500, overEndMm: 1000, heightMm: 3200 },
  heavyPiece: { warnKg: 5000, moveKg: 10000 },
};
export const MAX_CLEARANCE_MM = 500;
/** A heavy piece also leaves standard containers when the bedding it needs is this many times its own length. */
export const BEDDING_FACTOR = 2;

/**
 * What a floor carries, by the length the cargo rests on: points of (resting length in mm, weight
 * in kg), read in a straight line between them and flat beyond the last. `anyKg` is what a flat
 * rack carries on any length, however short.
 *
 * Source: Hapag-Lloyd, "Weight Distribution Guideline" (2022), the tables "Maximum payload related
 * to the Resting Length". General purpose, open top and hard-top containers have a wooden floor
 * (4.8 t per running metre on a 20', 3 t on a 40') or a steel floor (7.6 t and 6 t); the planner
 * takes the hard-tops as steel-floored, as before. Flat racks follow the table of their payload
 * class: the 20' of 31.2 t, the 40' of 39.3 t and the 40' high cube of 49 t; half that payload may
 * be loaded on any length. The 45' is read like a 40'.
 */
export interface FloorStrength {
  points: [number, number][];
  anyKg?: number;
}

const WOOD_20: FloorStrength = { points: [[0, 0], [6000, 28800]] };
const WOOD_40: FloorStrength = { points: [[0, 0], [6000, 18000], [7000, 21000], [8000, 23000], [9000, 26000], [9001, 28400]] };
const STEEL_20: FloorStrength = { points: [[0, 0], [3000, 22800], [4000, 30200]] };
const STEEL_40: FloorStrength = { points: [[0, 0], [4000, 24000], [5000, 28500]] };
const RACK_20: FloorStrength = { anyKg: 15600, points: [[2000, 18700], [4000, 23400], [6000, 31200]] };
const RACK_40: FloorStrength = { anyKg: 19650, points: [[2000, 21400], [4000, 23500], [6000, 26200], [8000, 29400], [10000, 33600], [12000, 39300]] };
const RACK_40_HIGH: FloorStrength = { anyKg: 24500, points: [[2000, 25600], [4000, 29400], [6000, 32700], [8000, 36800], [10000, 42100], [12000, 49100]] };

/** Beams under a piece may carry its weight this far beyond each of its ends, the carrier says: no further. */
export const BEDDING_END_MM = 1000;

export const CONTAINERS: ContainerSpec[] = [
  { id: "20dc", name: "20' DC", group: "standard", feet: 20, internalL: 5898, internalW: 2352, internalH: 2385, doorW: 2343, doorH: 2280, payloadKg: 28230, floor: WOOD_20 },
  { id: "20hc", name: "20' HC", group: "standard", feet: 20, internalL: 5898, internalW: 2352, internalH: 2698, doorW: 2343, doorH: 2585, payloadKg: 28130, floor: WOOD_20 },
  { id: "40dc", name: "40' DC", group: "standard", feet: 40, internalL: 12032, internalW: 2352, internalH: 2385, doorW: 2343, doorH: 2280, payloadKg: 28720, floor: WOOD_40 },
  { id: "40hc", name: "40' HC", group: "standard", feet: 40, internalL: 12032, internalW: 2352, internalH: 2698, doorW: 2343, doorH: 2585, payloadKg: 28600, floor: WOOD_40 },
  { id: "45hq", name: "45' HQ", group: "standard", feet: 45, internalL: 13556, internalW: 2352, internalH: 2698, doorW: 2343, doorH: 2585, payloadKg: 29300, floor: WOOD_40, onRequest: true },
  { id: "20ot", name: "20' OT", group: "open-top", feet: 20, internalL: 5897, internalW: 2350, internalH: 2377, doorW: 2338, doorH: 2347, payloadKg: 28130, floor: WOOD_20 },
  { id: "40ot", name: "40' OT", group: "open-top", feet: 40, internalL: 12029, internalW: 2350, internalH: 2380, doorW: 2338, doorH: 2346, payloadKg: 28450, floor: WOOD_40 },
  { id: "40hot", name: "40' HOT", group: "open-top", feet: 40, internalL: 12025, internalW: 2350, internalH: 2680, doorW: 2338, doorH: 2585, payloadKg: 28350, floor: WOOD_40 },
  { id: "20ht", name: "20' Hard-Top", group: "open-top", feet: 20, internalL: 5560, internalW: 2342, internalH: 2408, doorW: 2338, doorH: 2258, payloadKg: 28080, floor: STEEL_20, hardTop: true, onRequest: true },
  { id: "40ht", name: "40' Hard-Top", group: "open-top", feet: 40, internalL: 12020, internalW: 2342, internalH: 2693, doorW: 2338, doorH: 2258, payloadKg: 28300, floor: STEEL_40, hardTop: true, onRequest: true },
  { id: "20fr", name: "20' FR", group: "flat-rack", feet: 20, internalL: 5612, internalW: 2210, internalH: 2233, doorW: null, doorH: null, payloadKg: 31250, floor: RACK_20 },
  // The 40' flat racks carry 39,800 and 49,100 kg by the book; the planner loads them to 33,500 kg.
  { id: "40fr", name: "40' FR", group: "flat-rack", feet: 40, internalL: 11652, internalW: 2374, internalH: 1959, doorW: null, doorH: null, payloadKg: 33500, floor: RACK_40 },
  { id: "40hfr", name: "40' HFR", group: "flat-rack", feet: 40, internalL: 11652, internalW: 2347, internalH: 2265, doorW: null, doorH: null, payloadKg: 33500, floor: RACK_40_HIGH },
];

/** The most weight the container carries on this length of its floor, in kg; never more than its payload. */
export function maxWeightOn(c: ContainerSpec, restingMm: number): number {
  const { points, anyKg = 0 } = c.floor;
  const length = Math.min(restingMm, c.internalL);
  let kg = points[points.length - 1]![1];
  if (length < points[0]![0]) kg = 0;
  else {
    for (let i = 0; i + 1 < points.length; i++) {
      const [[l0, k0], [l1, k1]] = [points[i]!, points[i + 1]!];
      if (length <= l1) {
        kg = k0 + ((k1 - k0) * (length - l0)) / (l1 - l0);
        break;
      }
    }
  }
  return Math.min(c.payloadKg, Math.floor(Math.max(anyKg, kg)));
}

/** The same for a piece of this length along the container, with beams under it as far as the carrier allows. */
export const maxWeightWithBedding = (c: ContainerSpec, lengthMm: number): number => maxWeightOn(c, lengthMm + 2 * BEDDING_END_MM);

/** The shortest length of floor that carries this weight, in mm; null when the container never does. */
export function restingNeeded(c: ContainerSpec, weightKg: number): number | null {
  if (weightKg > maxWeightOn(c, c.internalL)) return null;
  let [low, high] = [0, c.internalL];
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (maxWeightOn(c, mid) >= weightKg) high = mid;
    else low = mid;
  }
  return high;
}

/** A wooden or steel floor's strength in tonnes per running metre; a flat rack has no such single figure. */
export const tonnesPerMetre = (c: ContainerSpec): number => maxWeightOn({ ...c, payloadKg: Infinity }, 1000) / 1000;

/** A container's floor strength in words: "4.8 t per metre", or for a flat rack what it takes on any length. */
export const floorText = (c: ContainerSpec): string =>
  c.floor.anyKg ? `${(c.floor.anyKg / 1000).toFixed(1)} t on any length, more by resting length` : `${tonnesPerMetre(c).toFixed(1)} t per running metre`;

/** The most cargo a container takes, in kg: its payload, or less where its floor carries less even over its whole length. */
export const maxCargoKg = (container: ContainerSpec): number => maxWeightOn(container, container.internalL);

/**
 * The equipment as planned with the company's rules: standard containers carry the clearance and
 * the heavy-piece weights, open tops and flat racks the out-of-gauge warning limits. Without rules
 * the equipment is as it is.
 */
export const containersWith = (rules?: PlanRules): ContainerSpec[] =>
  rules ? CONTAINERS.map((c) => (c.group === "standard" ? { ...c, clear: rules.clearance, heavy: rules.heavyPiece } : { ...c, oog: rules.oogWarning })) : CONTAINERS;

/**
 * Whether a piece is too heavy to be planned into this standard container: over the weight set for
 * it, or, once it is heavy enough to be warned about, needing bedding far longer than itself.
 */
export function tooHeavyToStuff(c: ContainerSpec, weightKg: number, longSideMm: number): boolean {
  if (!c.heavy) return false;
  if (weightKg > c.heavy.moveKg) return true;
  if (weightKg <= c.heavy.warnKg) return false;
  const needed = restingNeeded(c, weightKg);
  return needed === null || needed > BEDDING_FACTOR * longSideMm;
}

/** The widest and the highest piece that passes into the container, and the length of floor cargo may take. */
export const passWidth = (c: ContainerSpec): number => Math.min(c.internalW, (c.doorW ?? c.internalW) - (c.clear?.doorWidthMm ?? 0));
export const passHeight = (c: ContainerSpec): number => Math.min(c.internalH, (c.doorH ?? c.internalH) - (c.clear?.doorHeightMm ?? 0));
export const usableLength = (c: ContainerSpec): number => c.internalL - (c.clear?.lengthMm ?? 0);

/** Standard first, open tops for over-height, flat racks last. */
export const GROUP_ORDER: ContainerGroup[] = ["standard", "open-top", "flat-rack"];

export const GROUP_LABEL: Record<ContainerGroup, string> = {
  standard: "a standard container",
  "open-top": "an open top",
  "flat-rack": "a flat rack",
};
