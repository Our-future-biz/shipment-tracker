// One container, many positions (houses): pure rules shared by the container service, the gate
// job and the reports. No imports from the services (no import cycle).
//
//   import container (direction "Unloading", stripping): gate-in → stripping → each house ticked
//     received (the receipt of that výdej position) or marked short / not arrived → gate-out.
//   export container (direction "Loading", stuffing): planned from inbound (příjem) positions in
//     the warehouse → gate-in (empty at the dock) → houses stuffed → closed with the seal →
//     gate-out, which is when every stuffed position leaves the warehouse.

export type ContainerKind = "import" | "export";

/** Usable volume (cbm) and typical payload (kg) per equipment type, for fill and capacity checks. */
export const CONTAINER_CAPACITY: Record<string, { cbm: number; kg: number }> = {
  "20' DV": { cbm: 31, kg: 28_200 },
  "40' DV": { cbm: 66, kg: 26_700 },
  "40' HC": { cbm: 76, kg: 26_500 },
  "45' HC": { cbm: 84, kg: 27_600 },
  "20' OT": { cbm: 31, kg: 28_000 },
  "40' FR": { cbm: 0, kg: 40_000 },
};

/** Usable volume per equipment type (the Reports fill rates read this). */
export const EQUIPMENT_CAPACITY_CBM: Record<string, number> = Object.fromEntries(Object.entries(CONTAINER_CAPACITY).map(([k, v]) => [k, v.cbm]));

/** "Unloading" is an import container (stripped), "Loading" an export one (stuffed). */
export const containerKind = (direction: string): ContainerKind => (direction === "Loading" ? "export" : "import");

/** Export containers take inbound (příjem) cargo; import containers hold outbound (výdej) cargo. */
export const directionFits = (containerDirection: string, visit: string) =>
  containerKind(containerDirection) === "export" ? visit !== "výdej" : visit === "výdej";

export const TALLY_OUTCOMES = ["received", "short", "not_arrived"] as const;
export type TallyResult = (typeof TALLY_OUTCOMES)[number];

export const TALLY_LABEL: Record<TallyResult, string> = { received: "Received", short: "Short", not_arrived: "Not arrived" };

export type ContainerStatus = "Expected" | "Arrived" | "Stripping" | "Stripped" | "Planning" | "Stuffing" | "Closed" | "Gone out";

export interface ContainerStamps {
  direction: string;
  gateInAt: Date | null;
  strippingStartedAt: Date | null;
  closedAt: Date | null;
  gateOutAt: Date | null;
}

export interface LinkState {
  stuffedAt: Date | null;
  tallyOutcome: string;
  tickedAt: Date | null;
  addedBy: string;
}

/** Houses linked by migration 0017 (the old one-position containers) keep the manual received date. */
export const LEGACY_LINK = "migration";

/**
 * The houses of an import container that are tallied at the stripping: not the old one-position
 * links of migration 0017 (those keep the manual received date and are never tallied; a house
 * taken out and added again is tallied).
 */
export const tallyLinks = <L extends Pick<LinkState, "addedBy">>(links: L[]) => links.filter((l) => l.addedBy !== LEGACY_LINK);

/** Every tallied house of an import container is accounted for (ticked received, short or not arrived). */
export const strippingComplete = (links: LinkState[]) => {
  const tallied = tallyLinks(links);
  return tallied.length > 0 && tallied.every((l) => !!l.tallyOutcome);
};

/** When the last house was accounted for; null while some are open. */
export function strippingCompletedAt(links: LinkState[]): Date | null {
  if (!strippingComplete(links)) return null;
  return tallyLinks(links).reduce<Date | null>((a, l) => (l.tickedAt && (!a || l.tickedAt > a) ? l.tickedAt : a), null);
}

/** The container's status, derived from its stamps and houses (never stored). */
export function containerStatus(c: ContainerStamps, links: LinkState[]): ContainerStatus {
  if (c.gateOutAt) return "Gone out";
  if (containerKind(c.direction) === "export") {
    if (c.closedAt) return "Closed";
    if (links.some((l) => l.stuffedAt)) return "Stuffing";
    return "Planning";
  }
  if (!c.gateInAt) return "Expected";
  if (strippingComplete(links)) return "Stripped";
  if (c.strippingStartedAt || links.some((l) => l.tallyOutcome)) return "Stripping";
  return "Arrived";
}

export interface CargoFigures {
  colli: number;
  weightKg: number;
  measureCbm: number;
}

export interface ContainerTotals {
  pieces: number;
  kg: number;
  cbm: number;
  capacityCbm: number | null;
  capacityKg: number | null;
  /** Percent of the capacity used by volume and by weight; null without a known capacity. */
  fillCbmPct: number | null;
  fillKgPct: number | null;
  overCapacity: boolean;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Pieces / kg / cbm of the houses against the capacity of the equipment type. */
export function containerTotals(equipment: string, houses: CargoFigures[]): ContainerTotals {
  const pieces = houses.reduce((a, h) => a + (h.colli || 0), 0);
  const kg = round(houses.reduce((a, h) => a + (h.weightKg || 0), 0));
  const cbm = round(houses.reduce((a, h) => a + (h.measureCbm || 0), 0), 3);
  const cap = CONTAINER_CAPACITY[equipment];
  const fillCbmPct = cap && cap.cbm > 0 ? Math.round((cbm / cap.cbm) * 100) : null;
  const fillKgPct = cap && cap.kg > 0 ? Math.round((kg / cap.kg) * 100) : null;
  return {
    pieces,
    kg,
    cbm,
    capacityCbm: cap ? cap.cbm : null,
    capacityKg: cap ? cap.kg : null,
    fillCbmPct,
    fillKgPct,
    overCapacity: (fillCbmPct ?? 0) > 100 || (fillKgPct ?? 0) > 100,
  };
}
