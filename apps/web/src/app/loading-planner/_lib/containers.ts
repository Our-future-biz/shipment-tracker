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
}

export const CONTAINERS: ContainerSpec[] = [
  { id: "20dc", name: "20' DC", group: "standard", feet: 20, internalL: 5898, internalW: 2352, internalH: 2385, doorW: 2343, doorH: 2280, payloadKg: 28230, maxTonnesPerMetre: 4.5 },
  { id: "20hc", name: "20' HC", group: "standard", feet: 20, internalL: 5898, internalW: 2352, internalH: 2698, doorW: 2343, doorH: 2585, payloadKg: 28130, maxTonnesPerMetre: 4.5 },
  { id: "40dc", name: "40' DC", group: "standard", feet: 40, internalL: 12032, internalW: 2352, internalH: 2385, doorW: 2343, doorH: 2280, payloadKg: 28720, maxTonnesPerMetre: 3.0 },
  { id: "40hc", name: "40' HC", group: "standard", feet: 40, internalL: 12032, internalW: 2352, internalH: 2698, doorW: 2343, doorH: 2585, payloadKg: 28600, maxTonnesPerMetre: 3.0 },
  { id: "45hq", name: "45' HQ", group: "standard", feet: 45, internalL: 13556, internalW: 2352, internalH: 2698, doorW: 2343, doorH: 2585, payloadKg: 29300, maxTonnesPerMetre: 3.0 },
  { id: "20ot", name: "20' OT", group: "open-top", feet: 20, internalL: 5897, internalW: 2350, internalH: 2377, doorW: 2338, doorH: 2347, payloadKg: 28130, maxTonnesPerMetre: 4.5 },
  { id: "40ot", name: "40' OT", group: "open-top", feet: 40, internalL: 12029, internalW: 2350, internalH: 2380, doorW: 2338, doorH: 2346, payloadKg: 28450, maxTonnesPerMetre: 3.0 },
  { id: "40hot", name: "40' HOT", group: "open-top", feet: 40, internalL: 12025, internalW: 2350, internalH: 2680, doorW: 2338, doorH: 2585, payloadKg: 28350, maxTonnesPerMetre: 3.0 },
  { id: "20ht", name: "20' Hard-Top", group: "open-top", feet: 20, internalL: 5560, internalW: 2342, internalH: 2408, doorW: 2338, doorH: 2258, payloadKg: 28080, maxTonnesPerMetre: 7.6, hardTop: true },
  { id: "40ht", name: "40' Hard-Top", group: "open-top", feet: 40, internalL: 12020, internalW: 2342, internalH: 2693, doorW: 2338, doorH: 2258, payloadKg: 28300, maxTonnesPerMetre: 6.0, hardTop: true },
  { id: "20fr", name: "20' FR", group: "flat-rack", feet: 20, internalL: 5612, internalW: 2210, internalH: 2233, doorW: null, doorH: null, payloadKg: 31250, maxTonnesPerMetre: 6.0 },
  // The 40' flat racks carry 39,800 and 49,100 kg by the book; the planner loads them to 33,500 kg.
  { id: "40fr", name: "40' FR", group: "flat-rack", feet: 40, internalL: 11652, internalW: 2374, internalH: 1959, doorW: null, doorH: null, payloadKg: 33500, maxTonnesPerMetre: 8.0 },
  { id: "40hfr", name: "40' HFR", group: "flat-rack", feet: 40, internalL: 11652, internalW: 2347, internalH: 2265, doorW: null, doorH: null, payloadKg: 33500, maxTonnesPerMetre: 8.0 },
];

/** Standard first, open tops for over-height, flat racks last. */
export const GROUP_ORDER: ContainerGroup[] = ["standard", "open-top", "flat-rack"];

export const GROUP_LABEL: Record<ContainerGroup, string> = {
  standard: "a standard container",
  "open-top": "an open top",
  "flat-rack": "a flat rack",
};
