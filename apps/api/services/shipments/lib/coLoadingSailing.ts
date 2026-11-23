// A Co-Loading Concept service's sailings: the vessel a service's cargo goes on, made with "Create new
// sailing" on the service's page. For an import whose vessel is not known yet, the Vessel is the week
// it sails ("WEEK 44"), and then the Voyage may be left out. Pure, so it is tested without the database.

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
}

/** A sailing as it is saved: every field trimmed, a week written "WEEK 44". */
export type SailingValues = Required<SailingInput>;

const tidy = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ");

/** The values to save, or what is wrong with the input, in words for the form. */
export function checkSailingInput(input: SailingInput): { values: SailingValues } | { error: string } {
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
  return { values: { vessel: week ?? typed, voyage, pol, pod, hub, containerType } };
}

// ─── What may be changed on a sailing later: its number of containers and its cut-off ───

export const CONTAINER_COUNT_MAX = 20;
export const MOVE_REASON_MAX = 300;

/** What "Edit sailing" changes. */
export interface SailingDetails {
  containerCount: number;
  /** YYYY-MM-DD, or null for none. */
  cutoffDate: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Why these details cannot be saved, in words for the form; null when they can. */
export function sailingDetailsProblem(d: SailingDetails): string | null {
  if (!Number.isInteger(d.containerCount) || d.containerCount < 1 || d.containerCount > CONTAINER_COUNT_MAX) return `Give the number of containers, from 1 to ${CONTAINER_COUNT_MAX}.`;
  if (d.cutoffDate !== null && (!ISO_DAY.test(d.cutoffDate) || Number.isNaN(Date.parse(`${d.cutoffDate}T00:00:00Z`)))) return "The cut-off is not a date.";
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

/**
 * Why a shipment is an odd one in a box of a service of this mode, or null when it belongs there:
 * another mode of transport, or - in a consolidation box - a shipment with a container of its own
 * (Full Load) or a project shipment. A remark to show, never a refusal (Council Outlay 12, D12).
 * The web holds the same rule (app/co-loading/_lib/boxUtilization.ts oddInBox).
 */
export function oddInBox(serviceMode: string, shipment: { freightMode: string; loadType: string }): string | null {
  const mode = shipment.freightMode.trim();
  const load = shipment.loadType.trim();
  const wanted: Record<string, string> = { sea_lcl: "Sea Freight", sea_fcl: "Sea Freight", air: "Air Freight", rail: "Rail Freight", road: "Road Freight" };
  const want = wanted[serviceMode];
  if (want && mode && mode !== want) return mode;
  if (serviceMode === "sea_lcl" && (load === "Full Load" || load === "Project Shipment")) return load;
  return null;
}

// ─── Linking shipments to a sailing (its box) ───

/** A shipment as linking it is judged: its reference, its Service Name and the sailing it is on, if any. */
export interface ShipmentToLink {
  jobNumber: string;
  serviceName: string;
  /** The sailing it is linked to now (its vessel and voyage), or null. */
  onSailing: { id: string; name: string } | null;
}

/**
 * Why a shipment cannot be linked to the sailing, or null when it can: only the service's own
 * shipments (its Service Name, trimmed and in any case), and a shipment is on one sailing at a time.
 */
export function linkRefusal(shipment: ShipmentToLink, serviceName: string, sailingId: string): string | null {
  const own = serviceName.trim().toLowerCase();
  if (!own || shipment.serviceName.trim().toLowerCase() !== own) {
    return `${shipment.jobNumber} has the Service Name "${shipment.serviceName.trim() || "none"}": only ${serviceName.trim() || "the service's"} shipments go on this sailing.`;
  }
  if (shipment.onSailing?.id === sailingId) return `${shipment.jobNumber} is on this sailing already.`;
  if (shipment.onSailing) return `${shipment.jobNumber} is on ${shipment.onSailing.name}: remove it from there first.`;
  return null;
}
