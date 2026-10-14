import type { interfaces } from "@/lib/api/client";
import type { Tone } from "../gate-log/_lib/gate";

// One container, many positions (houses): what the container screens work out on the phone or
// desk before the server answers — which positions may be added, in what order they are offered,
// and the totals against the container's capacity. The server checks the same rules again
// (apps/api/services/warehouse/services/containerRules.ts). Pure (tested in containerPlan.test.ts).

type Movement = interfaces.GateMovementItem;
type Container = interfaces.WarehouseContainerItem;

/** Usable volume (cbm) and typical payload (kg) per container type — the same figures as the server. */
export const CONTAINER_CAPACITY: Record<string, { cbm: number; kg: number }> = {
  "20' DV": { cbm: 31, kg: 28_200 },
  "40' DV": { cbm: 66, kg: 26_700 },
  "40' HC": { cbm: 76, kg: 26_500 },
  "45' HC": { cbm: 84, kg: 27_600 },
  "20' OT": { cbm: 31, kg: 28_000 },
  "40' FR": { cbm: 0, kg: 40_000 },
};

export type ContainerKind = "import" | "export";

/** "Unloading" is an import container (stripped), "Loading" an export one (stuffed). */
export const containerKind = (direction: string): ContainerKind => (direction === "Loading" ? "export" : "import");

export const KIND_LABEL: Record<ContainerKind, string> = { import: "Import · stripping", export: "Export · stuffing" };

export const CONTAINER_STATUSES = ["Expected", "Arrived", "Stripping", "Stripped", "Planning", "Stuffing", "Closed", "Gone out"] as const;

export const CONTAINER_STATUS_TONE: Record<string, Tone> = {
  Expected: "",
  Arrived: "a",
  Stripping: "b",
  Stripped: "g",
  Planning: "",
  Stuffing: "b",
  Closed: "i",
  "Gone out": "g",
};

/** Conditions a house is tallied in (free text on the server; these are the quick choices). */
export const TALLY_CONDITIONS = ["Good", "Damaged packaging", "Damaged cargo", "Wet", "Re-packed"];

export const TALLY_LABEL: Record<string, string> = { received: "Received", short: "Short", not_arrived: "Not arrived" };
export const TALLY_TONE: Record<string, Tone> = { received: "g", short: "a", not_arrived: "r" };

type Figures = { pieces: number; kg: number; cbm: number };

export type PlanTotals = Figures & {
  capacityCbm: number | null;
  capacityKg: number | null;
  fillCbmPct: number | null;
  fillKgPct: number | null;
  overCapacity: boolean;
};

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Pieces / kg / cbm of these houses against the capacity of the container type. */
export function planTotals(equipment: string, houses: Figures[]): PlanTotals {
  const pieces = houses.reduce((a, h) => a + (h.pieces || 0), 0);
  const kg = round(houses.reduce((a, h) => a + (h.kg || 0), 0), 2);
  const cbm = round(houses.reduce((a, h) => a + (h.cbm || 0), 0), 3);
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

/** The fuller of volume and weight (what the fill bar shows); null without a known capacity. */
export const fillPct = (t: Pick<PlanTotals, "fillCbmPct" | "fillKgPct">) =>
  t.fillCbmPct == null && t.fillKgPct == null ? null : Math.max(t.fillCbmPct ?? 0, t.fillKgPct ?? 0);

/** Colour of the fill bar: red over capacity, amber from 90 %, otherwise indigo. */
export const fillTone = (pct: number | null) => (pct == null ? "bg-slate-200" : pct > 100 ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-indigo-500");

const onHold = (m: Pick<Movement, "openExceptions" | "overridden">) => m.openExceptions > 0 && !m.overridden;

/**
 * Why a position cannot be added to this container (the same rules as the server), or null when
 * it can. Export: inbound positions received in the warehouse, not left, not on hold. Import:
 * outbound positions not received yet. A position is in at most one container.
 */
export function addBlocked(
  m: Pick<Movement, "visit" | "expReceipt" | "impRelease" | "leftAt" | "receivedAt" | "archivedAt" | "openExceptions" | "overridden" | "container">,
  direction: string,
  containerId?: string,
): string | null {
  if (m.archivedAt) return "Archived";
  if (m.container) return m.container.id === containerId ? "Already in this container" : `In container ${m.container.number}`;
  if (containerKind(direction) === "export") {
    if (m.visit === "výdej") return "Outbound cargo — an export container is stuffed with inbound cargo";
    if (!m.expReceipt) return "Not received in the warehouse yet";
    if (m.leftAt || m.impRelease) return "Already left the warehouse";
    if (onHold(m)) return "On hold — an open exception";
    return null;
  }
  if (m.visit !== "výdej") return "Inbound cargo — an import container holds outbound cargo";
  if (m.receivedAt || m.impRelease) return "Already received";
  return null;
}

/** The positions the picker offers, in order: POD, then ETD, then the warehouse ref. */
export function planCandidates<M extends Parameters<typeof addBlocked>[0] & Pick<Movement, "pod" | "etd" | "positionRef" | "gateRef">>(
  movements: M[],
  direction: string,
  containerId?: string,
): M[] {
  return movements
    .filter((m) => addBlocked(m, direction, containerId) === null)
    .sort(
      (a, b) =>
        (a.pod || "~").localeCompare(b.pod || "~") ||
        (a.etd || "9999").localeCompare(b.etd || "9999") ||
        (a.positionRef || a.gateRef).localeCompare(b.positionRef || b.gateRef),
    );
}

/** Houses linked from the old one-position register (migration 0017): not tallied, they keep the typed received date. */
export const LEGACY_HOUSE = "migration";

type House = Container["positions"][number];

/**
 * Why this house is not tallied at the stripping (the server refuses it too), or null when it is:
 * an old register link, or inbound cargo in an import container.
 */
export function tallyExempt(h: Pick<House, "addedBy" | "visit">, direction: string): string | null {
  if (containerKind(direction) === "export") return null;
  if (h.visit !== "výdej") return "Inbound cargo — it is received with the WH receipt, not at the stripping tally";
  if (h.addedBy === LEGACY_HOUSE) return "From the old container register — it keeps its typed received date; take it out and add it again to tally it";
  return null;
}

/** The houses of an import container that are tallied (not the old register links). */
export const tallyHouses = (c: Pick<Container, "positions" | "direction">) => c.positions.filter((h) => h.addedBy !== LEGACY_HOUSE);

/** The houses that are open at the tally (not ticked received nor marked short / not arrived). */
export const openHouses = (c: Pick<Container, "positions" | "direction">) => tallyHouses(c).filter((h) => !h.tallyOutcome);

/** Import: every tallied house accounted for. */
export const strippingComplete = (c: Pick<Container, "positions" | "direction">) => tallyHouses(c).length > 0 && openHouses(c).length === 0;

/** The house list with one house moved up (-1) or down (+1); ids of the houses' positions, in order. */
export function moveHouse(order: string[], movementId: string, by: -1 | 1): string[] {
  const i = order.indexOf(movementId);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** The house list with one house dropped before another (drag and drop). */
export function dropHouse(order: string[], dragged: string, before: string): string[] {
  if (dragged === before || !order.includes(dragged) || !order.includes(before)) return order;
  const rest = order.filter((id) => id !== dragged);
  rest.splice(rest.indexOf(before), 0, dragged);
  return rest;
}

/** The next container stamp, in strict order; null when it has gone out. */
export function nextContainerStamp(c: Pick<Container, "direction" | "gateInAt" | "strippingStartedAt" | "closedAt" | "gateOutAt">): interfaces.ContainerStampKind | null {
  if (c.gateOutAt) return null;
  if (!c.gateInAt) return "gateIn";
  if (containerKind(c.direction) === "export") return c.closedAt ? "gateOut" : "close";
  return c.strippingStartedAt ? "gateOut" : "strippingStart";
}

export const CONTAINER_STAMP_LABEL: Record<interfaces.ContainerStampKind, string> = {
  gateIn: "Container gate-in",
  strippingStart: "Start stripping",
  close: "Close (seal)",
  gateOut: "Container gate-out",
};

/** Container stamps the phone may record offline and send later (the close and the gate-out need the server). */
export const QUEUEABLE_CONTAINER_STAMPS: readonly interfaces.ContainerStampKind[] = ["gateIn", "strippingStart"];

/** Why a container stamp cannot be taken now (the server checks again), or null. */
export function containerStampBlocked(c: Pick<Container, "direction" | "gateInAt" | "strippingStartedAt" | "closedAt" | "gateOutAt" | "positions">, kind: interfaces.ContainerStampKind): string | null {
  const exp = containerKind(c.direction) === "export";
  switch (kind) {
    case "gateIn":
      return c.gateInAt ? "Already stamped" : null;
    case "strippingStart":
      if (exp) return "Only an import container is stripped";
      if (!c.gateInAt) return "Stamp the container gate-in first";
      return c.strippingStartedAt ? "Already started" : null;
    case "close":
      if (!exp) return "Only an export container is closed after stuffing";
      if (!c.gateInAt) return "Stamp the container gate-in first";
      if (c.closedAt) return "Already closed";
      return c.positions.some((h) => h.stuffedAt) ? null : "Nothing is stuffed yet — mark the stuffed houses first";
    case "gateOut": {
      if (c.gateOutAt) return "Already stamped";
      if (!c.gateInAt) return "Stamp the container gate-in first";
      if (exp) return c.closedAt ? null : "Close the stuffing with the seal first";
      const open = openHouses(c).length;
      if (open) return `Stripping is not complete — ${open} house${open === 1 ? "" : "s"} not accounted for`;
      if (!c.strippingStartedAt && !c.positions.some((h) => h.addedBy === LEGACY_HOUSE)) return "Start the stripping first (and add the houses the container brings)";
      return null;
    }
  }
}

/** What a container stamp writes to the shipments of its houses, for the confirmation text. */
export function containerStampWrites(c: Pick<Container, "direction" | "positions" | "plate">, kind: interfaces.ContainerStampKind, plate = ""): string {
  if (kind === "gateOut" && containerKind(c.direction) === "export") {
    const n = c.positions.filter((h) => h.stuffedAt).length;
    const stays = c.positions.length - n;
    return `${n} stuffed house${n === 1 ? "" : "s"} leave${n === 1 ? "s" : ""} the warehouse: the storage clock stops and each linked shipment gets the warehouse released date${plate || c.plate ? ` and the truck plate ${plate || c.plate}` : ""}.${stays ? ` ${stays} planned house${stays === 1 ? "" : "s"} not stuffed stay${stays === 1 ? "s" : ""} in the warehouse.` : ""}`;
  }
  if (kind === "close") return "The stuffing is finished: no house can be stuffed or taken out after this.";
  return "Nothing is written to the shipments.";
}
