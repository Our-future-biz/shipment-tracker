// A Co-Loading Concept service's sailings: the vessel a service's cargo goes on, made with "Create new
// sailing" on the service's page. For an import whose vessel is not known yet, the Vessel is the week
// it sails ("WEEK 44"), and then the Voyage may be left out. Pure, so it is tested without the database.

import { sailingDetailChanges } from "./coLoadingBoxCosts";

/**
 * The container types a sailing takes: twins of the web's CONTAINER_TYPES (lib/cargo), size by size,
 * as a quote's and a shipment's containers are picked.
 */
export const SAILING_CONTAINER_TYPES = [
  "20' DC",
  "20' RF",
  "20' OT",
  "20' HOT",
  "20' FR",
  "40' DC",
  "40' HC",
  "40' HRF",
  "40' OT",
  "40' HOT",
  "40' FR",
  "40' HFR",
  "45' HQ",
] as const;

export const VESSEL_MAX = 100;
export const VOYAGE_MAX = 40;

// "WEEK 44", "week44", "Wk 44", "W44": a sailing week (1 to 53), written in any of these ways.
const WEEK = /^(?:week|wk|w)\.?\s*(\d{1,2})$/i;

/** The week a Vessel names, "WEEK 44", or null when it names a vessel. */
export function sailingWeek(vessel: string): string | null {
  const m = WEEK.exec(vessel.trim());
  if (!m) return null;
  const week = Number(m[1]);
  return week >= 1 && week <= 53 ? `WEEK ${week}` : null;
}

/** What a new sailing is made from, as typed in the form. */
export interface SailingInput {
  vessel: string;
  voyage?: string;
  pol: string;
  pod: string;
  hub: string;
  containerType: string;
  /** How many containers of that type it has; 1 when left out. */
  containerCount?: number;
  /** The day cargo must be in by, YYYY-MM-DD; none when left out. */
  cutoffDate?: string | null;
  /** The day it leaves, YYYY-MM-DD; none when left out. */
  departureDate?: string | null;
}

/** A sailing as it is saved: every field trimmed, a week written "WEEK 44", one container, no cut-off and no departure date unless given. */
export type SailingValues = Required<Omit<SailingInput, "cutoffDate" | "departureDate">> & { cutoffDate: string | null; departureDate: string | null };

const tidy = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ");

/** A sailing's own facts: what it is called, where it goes and the kind of box it is. */
export interface SailingFacts {
  vessel: string;
  voyage: string;
  pol: string;
  pod: string;
  hub: string;
  containerType: string;
}

/** The facts as they are saved (trimmed, a week written "WEEK 44"), or what is wrong with them, in words for the form. */
export function checkSailingFacts(input: Partial<SailingFacts>): { facts: SailingFacts } | { error: string } {
  const typed = tidy(input.vessel);
  if (!typed) return { error: "Give the vessel, or the week it sails (WEEK 44)." };
  if (typed.length > VESSEL_MAX) return { error: `The vessel can be at most ${VESSEL_MAX} characters.` };
  const week = sailingWeek(typed);
  const voyage = tidy(input.voyage);
  // A vessel not known yet has no voyage either: only a named vessel needs one.
  if (!week && !voyage) return { error: "Give the voyage, or write the week in Vessel (WEEK 44) while the vessel is not known." };
  if (voyage.length > VOYAGE_MAX) return { error: `The voyage can be at most ${VOYAGE_MAX} characters.` };
  const pol = tidy(input.pol);
  if (!pol) return { error: "Give the Port of Loading." };
  const pod = tidy(input.pod);
  if (!pod) return { error: "Give the Port of Discharge." };
  const hub = tidy(input.hub);
  if (!hub) return { error: "Give the HUB." };
  const containerType = tidy(input.containerType);
  if (!(SAILING_CONTAINER_TYPES as readonly string[]).includes(containerType)) return { error: "Pick the container type." };
  return { facts: { vessel: week ?? typed, voyage, pol, pod, hub, containerType } };
}

/** The values to save, or what is wrong with the input, in words for the form. `today` is YYYY-MM-DD. */
export function checkSailingInput(input: SailingInput, today: string): { values: SailingValues } | { error: string } {
  const checked = checkSailingFacts(input);
  if ("error" in checked) return checked;
  const details = { containerCount: input.containerCount ?? 1, cutoffDate: input.cutoffDate || null, departureDate: input.departureDate || null };
  const wrong = sailingDetailsProblem(details, today);
  if (wrong) return { error: wrong };
  return { values: { ...checked.facts, ...details } };
}

// ─── What may be changed on a sailing later: all of it (Council Outlay 14, A2) ───

export const CONTAINER_COUNT_MAX = 20;
export const MOVE_REASON_MAX = 300;
/** The most shipments linked in one go: what the Link shipments dialog can tick, and what the API takes (MaxLen). */
export const LINK_AT_ONCE_MAX = 200;

/** What "Edit sailing" changes. */
export interface SailingDetails {
  containerCount: number;
  /** YYYY-MM-DD, or null for none. */
  cutoffDate: string | null;
  /** YYYY-MM-DD, or null for none; left out, it stays as it is. */
  departureDate?: string | null;
  /** The sailing's own facts: each one left out stays as it is. */
  vessel?: string;
  voyage?: string;
  pol?: string;
  pod?: string;
  hub?: string;
  containerType?: string;
}

/** A sailing as "Edit sailing" finds it. */
export type SailingStored = SailingFacts & { containerCount: number; cutoffDate: string | null; departureDate: string | null };

/** One change of a sailing as the record of changes keeps it: numbers in the amounts, words and dates in the notes. */
export interface SailingChangeNote {
  kind: string;
  oldAmount: number | null;
  newAmount: number | null;
  oldNote: string;
  newNote: string;
}

const FACT_KINDS: readonly (readonly [keyof SailingFacts, string])[] = [
  ["vessel", "vessel"],
  ["voyage", "voyage"],
  ["pol", "pol"],
  ["pod", "pod"],
  ["hub", "hub"],
  ["containerType", "container_type"],
];

/**
 * What "Edit sailing" changed besides the number of containers and the departure date: the vessel,
 * the voyage, the ports, the HUB, the container type and the cut-off, old and new in the notes.
 */
export function sailingFactChanges(before: SailingStored, facts: SailingFacts, cutoffDate: string | null): SailingChangeNote[] {
  const out: SailingChangeNote[] = [];
  for (const [field, kind] of FACT_KINDS) if (facts[field] !== before[field]) out.push({ kind, oldAmount: null, newAmount: null, oldNote: before[field], newNote: facts[field] });
  if (cutoffDate !== before.cutoffDate) out.push({ kind: "cutoff", oldAmount: null, newAmount: null, oldNote: before.cutoffDate ?? "", newNote: cutoffDate ?? "" });
  return out;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** More than two years before or after today (both YYYY-MM-DD). */
const farFrom = (day: string, today: string) => Math.abs(Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) > 2 * 366 * 86_400_000;
const notADay = (day: string) => !ISO_DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`));

/**
 * Why these details cannot be saved, in words for the form; null when they can. `today` is
 * YYYY-MM-DD. `stored` is the sailing as it is, null for a new one: a departure date left out stays
 * the stored one, so the cut-off is checked against that too.
 */
export function sailingDetailsProblem(d: SailingDetails, today: string, stored: { departureDate: string | null } | null = null): string | null {
  if (!Number.isInteger(d.containerCount) || d.containerCount < 1 || d.containerCount > CONTAINER_COUNT_MAX) return `Give the number of containers, from 1 to ${CONTAINER_COUNT_MAX}.`;
  if (d.cutoffDate !== null && notADay(d.cutoffDate)) return "The cut-off is not a date.";
  if (d.departureDate != null && notADay(d.departureDate)) return "The departure date is not a date.";
  const storedDeparture = stored?.departureDate ?? null;
  const departure = d.departureDate === undefined ? storedDeparture : d.departureDate;
  // A slip of the year (2025 for 2026) would value the box costs at an old rate, as if final. Only a
  // date being typed can slip: a sailing that left long ago keeps its date and stays editable.
  if (d.departureDate != null && d.departureDate !== storedDeparture && farFrom(d.departureDate, today)) return "The departure date is more than two years from today: check the year.";
  if (d.cutoffDate !== null && departure !== null && d.cutoffDate > departure) return "The cut-off cannot be after the departure date.";
  return null;
}

/** What "Edit sailing" may do to a sailing: the facts to save and the changes it records. */
export type SailingEdit = { invalid: string } | { denied: string } | { changes: SailingChangeNote[]; facts: SailingFacts };

/**
 * "Edit sailing" judged on the sailing as it is when its row is locked: what is wrong with what was
 * typed, or who may not make the change, or the facts to save with every change, for the record.
 * The number of containers, the departure date and the container type move the box costs (what a
 * box holds, and the day its costs are valued at): once a container has box costs, only managers and
 * admins change them (Council Review 7, K13; Council Outlay 14, D3). `mayMoveCosts` says whether the
 * editor is one of them. The vessel, the voyage, the ports, the HUB and the cut-off stay anyone's.
 */
export function sailingEdit(
  stored: SailingStored,
  details: SailingDetails,
  context: { today: string; costedContainers: readonly number[]; mayMoveCosts: boolean },
): SailingEdit {
  const checked = checkSailingFacts({
    vessel: details.vessel ?? stored.vessel,
    voyage: details.voyage ?? stored.voyage,
    pol: details.pol ?? stored.pol,
    pod: details.pod ?? stored.pod,
    hub: details.hub ?? stored.hub,
    containerType: details.containerType ?? stored.containerType,
  });
  if ("error" in checked) return { invalid: checked.error };
  const problem = sailingDetailsProblem(details, context.today, stored);
  if (problem) return { invalid: problem };
  const moving = sailingDetailChanges(stored, details);
  const typeChanged = checked.facts.containerType !== stored.containerType;
  if ((moving.length > 0 || typeChanged) && !context.mayMoveCosts && context.costedContainers.length > 0)
    return { denied: "This sailing has box costs: only managers and admins change its container type, its number of containers or its departure date." };
  return { changes: [...moving, ...sailingFactChanges(stored, checked.facts, details.cutoffDate)], facts: checked.facts };
}

/**
 * Why a sailing cannot be removed, or null when it can (Council Outlay 14, D4): one made by mistake
 * goes, by a manager or admin, while it holds no shipment and no box cost. Anything it holds stays.
 */
export function sailingRemovalRefusal(sailing: { linkedShipments: number; costedContainers: readonly number[] }, mayRemove: boolean): { denied: string } | { refused: string } | null {
  if (!mayRemove) return { denied: "Only managers and admins remove a sailing." };
  if (sailing.linkedShipments > 0)
    return { refused: `This sailing has ${sailing.linkedShipments === 1 ? "1 shipment" : `${sailing.linkedShipments} shipments`} linked: move or remove ${sailing.linkedShipments === 1 ? "it" : "them"} first.` };
  if (sailing.costedContainers.length > 0) return { refused: "This sailing has box costs: clear them first." };
  return null;
}

/**
 * Why a shipment cannot be moved to this sailing, or null when it can: only to another sailing of
 * the same service, with the reason it is left behind typed.
 */
export function moveRefusal(from: { id: string; serviceId: string }, to: { id: string; serviceId: string } | null, reason: string): string | null {
  if (!to) return "The sailing to move it to was not found.";
  if (to.id === from.id) return "Pick another sailing to move it to.";
  if (to.serviceId !== from.serviceId) return "A shipment moves only to another sailing of the same service.";
  if (!reason.trim()) return "Say why the shipment is moved.";
  if (reason.trim().length > MOVE_REASON_MAX) return `The reason can be at most ${MOVE_REASON_MAX} characters.`;
  return null;
}

// ─── What kind of shipment a box is for ───

/** What a box of a service of each mode takes, for the refusal. */
const BOX_IS_FOR: Record<string, string> = {
  sea_lcl: "only Sea LCL shipments go on this sailing",
  sea_fcl: "only Sea Freight shipments go on this sailing",
  air: "only Air Freight shipments go on this sailing",
  rail: "only Rail Freight shipments go on this sailing",
  road: "only Road Freight shipments go on this sailing",
};

/**
 * Why a shipment is an odd one in a box of a service of this mode, or null when it belongs there:
 * another mode of transport, or - in a consolidation box - a shipment with a container of its own
 * (Full Load) or a project shipment. Linking or moving such a shipment in is refused (Council Review 7,
 * K3); one that became odd after it was linked is remarked on.
 * Both are read trimmed and in any case, as a job number's letters (lib/jobNumber) and the list's mode
 * filter read them: a value typed before it was a list may differ in either.
 * The web holds the same rule (app/co-loading/_lib/boxUtilization.ts oddInBox).
 */
export function oddInBox(serviceMode: string, shipment: { freightMode: string; loadType: string }): string | null {
  const same = (value: string, name: string) => value.trim().toLowerCase() === name.toLowerCase();
  const mode = shipment.freightMode.trim();
  const wanted: Record<string, string> = { sea_lcl: "Sea Freight", sea_fcl: "Sea Freight", air: "Air Freight", rail: "Rail Freight", road: "Road Freight" };
  const want = wanted[serviceMode];
  if (want && mode && !same(mode, want)) return mode;
  if (serviceMode === "sea_lcl") return ["Full Load", "Project Shipment"].find((load) => same(shipment.loadType, load)) ?? null;
  return null;
}

// ─── Linking shipments to a sailing (its box) ───

/** A shipment as linking it is judged: its reference, its Service Name and the sailing it is on, if any. */
export interface ShipmentToLink {
  jobNumber: string;
  serviceName: string;
  /** Its mode of transport and load type ("Sea Freight", "Full Load"): what kind of box it belongs in. */
  freightMode?: string;
  loadType?: string;
  /** The sailing it is linked to now (its vessel and voyage), or null. */
  onSailing: { id: string; name: string } | null;
}

/**
 * Why a shipment cannot be linked to the sailing, or null when it can: only the service's own
 * shipments (its Service Name, trimmed and in any case), and a shipment is on one sailing at a time.
 */
export function linkRefusal(shipment: ShipmentToLink, serviceName: string, sailingId: string, serviceMode?: string): string | null {
  // Only the shipments the box is for go in (Council Review 7, K3): another mode of transport, or a
  // full load or project shipment in a consolidation box, is refused - its own freight is not the box's.
  const odd = serviceMode && shipment.freightMode !== undefined ? oddInBox(serviceMode, { freightMode: shipment.freightMode, loadType: shipment.loadType ?? "" }) : null;
  if (odd) return `${shipment.jobNumber} is ${odd}: ${BOX_IS_FOR[serviceMode!] ?? "this box is not for it"}.`;
  const own = serviceName.trim().toLowerCase();
  if (!own || shipment.serviceName.trim().toLowerCase() !== own) {
    return `${shipment.jobNumber} has the Service Name "${shipment.serviceName.trim() || "none"}": only ${serviceName.trim() || "the service's"} shipments go on this sailing.`;
  }
  if (shipment.onSailing?.id === sailingId) return `${shipment.jobNumber} is on this sailing already.`;
  if (shipment.onSailing) return `${shipment.jobNumber} is on ${shipment.onSailing.name}: remove it from there first.`;
  return null;
}

// ─── A sailing's facts on its shipments (Council Outlay 14, A3) ───

/** A linked shipment as its facts are compared with its sailing's. */
export interface ShipmentFacts {
  status: string;
  masterJobId: string | null;
  vessel: string;
  voyage: string;
  estimatedDeparture: string | null;
  closingDate: string | null;
  actualDeparture: string | null;
  pol: string;
  pod: string;
}

/** The shipment fields "Copy to linked shipments" writes. */
export type CopiedField = "vessel" | "voyage" | "estimatedDeparture" | "closingDate";

/** One field the copy would change on a shipment: what it holds now and what the sailing gives. */
export interface FactChange {
  field: CopiedField;
  label: string;
  old: string;
  next: string;
}

/** What stands between a sailing and one of its shipments. */
export interface ShipmentFactsDiff {
  /** What the copy would write. Empty when the shipment agrees, and when it is skipped. */
  changes: FactChange[];
  /** What differs and is never copied - the ports: a shipment on the wrong lane is for a person to judge. */
  mismatches: { label: string; shipment: string; sailing: string }[];
  /** Why the shipment is left alone, in words; null when it is not. */
  skipped: string | null;
}

/** A place read for comparing: its UN/LOCODE when it carries one ("Shanghai (CNSHA)"), else its text, in lower case. */
const placeKey = (place: string) => (/\(([A-Za-z]{5})\)\s*$/.exec(place)?.[1] ?? place).trim().toLowerCase();

/**
 * A sailing's facts beside one of its shipments. The copy writes the vessel and the voyage once the
 * vessel is named (a week is no vessel), the departure date as the shipment's ETD and the cut-off as
 * its Closing Date - each only where the sailing has it, so nothing on a shipment is ever blanked.
 * A shipment in a master job takes these from its master job; a cancelled one, and one that has
 * departed, are left as they are. The ports are compared and never written.
 */
export function shipmentFactsDiff(sailing: SailingStored, shipment: ShipmentFacts, cancelledStatus: string): ShipmentFactsDiff {
  const mismatches: ShipmentFactsDiff["mismatches"] = [];
  for (const [label, mine, theirs] of [
    ["Port of Loading", shipment.pol, sailing.pol],
    ["Port of Discharge", shipment.pod, sailing.pod],
  ] as const)
    if (mine.trim() && placeKey(mine) !== placeKey(theirs)) mismatches.push({ label, shipment: mine.trim(), sailing: theirs });
  const skipped = shipment.masterJobId
    ? "In a master job: its vessel and dates come from there."
    : shipment.status === cancelledStatus
      ? "Cancelled."
      : shipment.actualDeparture
        ? "Has departed already."
        : null;
  const changes: FactChange[] = [];
  const give = (field: CopiedField, label: string, old: string | null, next: string | null) => {
    if (next && next !== (old ?? "").trim()) changes.push({ field, label, old: (old ?? "").trim(), next });
  };
  const named = sailingWeek(sailing.vessel) === null;
  give("vessel", "Vessel", shipment.vessel, named ? sailing.vessel : null);
  give("voyage", "Voyage", shipment.voyage, named ? sailing.voyage : null);
  give("estimatedDeparture", "ETD", shipment.estimatedDeparture, sailing.departureDate);
  give("closingDate", "Closing Date", shipment.closingDate, sailing.cutoffDate);
  // A skipped shipment still shows what differs: the row says why nothing will be written.
  return { changes, mismatches, skipped };
}
