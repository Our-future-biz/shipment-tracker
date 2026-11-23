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
  /** Floor strength: tonnes per running metre of floor the cargo rests on. */
  maxTonnesPerMetre: number;
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

export const CONTAINERS: ContainerSpec[] = [
  { id: "20dc", name: "20' DC", group: "standard", feet: 20, internalL: 5898, internalW: 2352, internalH: 2385, doorW: 2343, doorH: 2280, payloadKg: 28230, maxTonnesPerMetre: 4.5 },
  { id: "20hc", name: "20' HC", group: "standard", feet: 20, internalL: 5898, internalW: 2352, internalH: 2698, doorW: 2343, doorH: 2585, payloadKg: 28130, maxTonnesPerMetre: 4.5 },
  { id: "40dc", name: "40' DC", group: "standard", feet: 40, internalL: 12032, internalW: 2352, internalH: 2385, doorW: 2343, doorH: 2280, payloadKg: 28720, maxTonnesPerMetre: 3.0 },
  { id: "40hc", name: "40' HC", group: "standard", feet: 40, internalL: 12032, internalW: 2352, internalH: 2698, doorW: 2343, doorH: 2585, payloadKg: 28600, maxTonnesPerMetre: 3.0 },
  { id: "45hq", name: "45' HQ", group: "standard", feet: 45, internalL: 13556, internalW: 2352, internalH: 2698, doorW: 2343, doorH: 2585, payloadKg: 29300, maxTonnesPerMetre: 3.0, onRequest: true },
  { id: "20ot", name: "20' OT", group: "open-top", feet: 20, internalL: 5897, internalW: 2350, internalH: 2377, doorW: 2338, doorH: 2347, payloadKg: 28130, maxTonnesPerMetre: 4.5 },
  { id: "40ot", name: "40' OT", group: "open-top", feet: 40, internalL: 12029, internalW: 2350, internalH: 2380, doorW: 2338, doorH: 2346, payloadKg: 28450, maxTonnesPerMetre: 3.0 },
  { id: "40hot", name: "40' HOT", group: "open-top", feet: 40, internalL: 12025, internalW: 2350, internalH: 2680, doorW: 2338, doorH: 2585, payloadKg: 28350, maxTonnesPerMetre: 3.0 },
  { id: "20ht", name: "20' Hard-Top", group: "open-top", feet: 20, internalL: 5560, internalW: 2342, internalH: 2408, doorW: 2338, doorH: 2258, payloadKg: 28080, maxTonnesPerMetre: 7.6, hardTop: true, onRequest: true },
  { id: "40ht", name: "40' Hard-Top", group: "open-top", feet: 40, internalL: 12020, internalW: 2342, internalH: 2693, doorW: 2338, doorH: 2258, payloadKg: 28300, maxTonnesPerMetre: 6.0, hardTop: true, onRequest: true },
  { id: "20fr", name: "20' FR", group: "flat-rack", feet: 20, internalL: 5612, internalW: 2210, internalH: 2233, doorW: null, doorH: null, payloadKg: 31250, maxTonnesPerMetre: 6.0 },
  // The 40' flat racks carry 39,800 and 49,100 kg by the book; the planner loads them to 33,500 kg.
  { id: "40fr", name: "40' FR", group: "flat-rack", feet: 40, internalL: 11652, internalW: 2374, internalH: 1959, doorW: null, doorH: null, payloadKg: 33500, maxTonnesPerMetre: 8.0 },
  { id: "40hfr", name: "40' HFR", group: "flat-rack", feet: 40, internalL: 11652, internalW: 2347, internalH: 2265, doorW: null, doorH: null, payloadKg: 33500, maxTonnesPerMetre: 8.0 },
];

/**
 * The most cargo a container takes, in kg: its payload, or less where the floor would not carry
 * that much even spread over its whole length (a 20' DC: 4.5 t/m on 5.9 m is 26.5 t).
 */
export const maxCargoKg = (container: ContainerSpec): number => Math.min(container.payloadKg, Math.floor(container.maxTonnesPerMetre * container.internalL));

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
  return weightKg > c.heavy.warnKg && weightKg / c.maxTonnesPerMetre > BEDDING_FACTOR * longSideMm;
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
