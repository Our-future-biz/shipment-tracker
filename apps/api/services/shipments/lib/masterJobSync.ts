import { normalizeContainerNumber } from "./cargoProjection";
import { placeCodeOf } from "../../../lib/geo/format";
import type { ContainerLine } from "../interfaces/interfaces";

// Pure rules for how a master job's MBL details flow onto its house shipments.
// The master job is the source of truth: a synced field on the master job
// overwrites the same field on every linked shipment.

/** Master-job fields copied onto every linked shipment (same name on both tables). */
export const MASTER_JOB_SYNCED_FIELDS = [
  "masterBolNumber",
  "masterBolType",
  "pol",
  "pod",
  "hub",
  "serviceName",
  "loadType",
  "shippingLine",
  "estimatedDeparture",
  "estimatedArrival",
  "actualDeparture",
  "actualArrival",
  "etaWarehouse",
  "warehouseReceivedDate",
  // From the booking confirmation.
  "bookingNumber",
  "closingDate",
  "vgmClosing",
  "siClosing",
  "closingTime",
  "vgmClosingTime",
  "siClosingTime",
  "amsDeadline",
  "amsDeadlineTime",
  "isfDeadline",
  "isfDeadlineTime",
  "releaseReference",
  "releaseDepot",
  "redeliveryReference",
  "redeliveryDepot",
  "supplierPic",
  "vessel",
  "voyage",
] as const;

export type MasterJobSyncedField = (typeof MASTER_JOB_SYNCED_FIELDS)[number];

const SYNCED = new Set<string>(MASTER_JOB_SYNCED_FIELDS);

/**
 * The synced values to write onto a house. With `changedOnly` (a save on the
 * master job) every synced key in it is written, blanks included — clearing a
 * field on the master job clears it on the houses. Without it (a shipment just
 * linked) only filled-in values are written, so an empty master job never
 * wipes data the house already has.
 */
export function syncedShipmentData(
  masterJob: Record<string, unknown>,
  changedOnly?: Record<string, unknown>,
): Partial<Record<MasterJobSyncedField, string | null>> {
  const out: Record<string, string | null> = {};
  if (changedOnly) {
    for (const key of Object.keys(changedOnly)) {
      if (SYNCED.has(key)) out[key] = (changedOnly[key] as string | null) ?? null;
    }
    return out;
  }
  for (const key of MASTER_JOB_SYNCED_FIELDS) {
    const value = masterJob[key];
    if (value != null && value !== "") out[key] = value as string;
  }
  return out;
}

/**
 * What a master job made from houses starts with (User Council O10, owner's answer Q6): its own Freight
 * Mode and Trade Direction, which only name it, and the synced fields but the Master B/L. Houses that
 * agree on a Master B/L carry another master job's (step 3 review M3): taken over, two live master
 * jobs would hold it, and a pre-alert or a vendor invoice read by that B/L would find the old one.
 * The Master B/L is typed on the new master job, or comes with a pre-alert (createForMasterBol).
 */
const NOT_PREFILLED = new Set<string>(["masterBolNumber", "masterBolType"]);
export const MASTER_JOB_PREFILLED_FIELDS = ["freightMode", "tradeDirection", ...MASTER_JOB_SYNCED_FIELDS.filter((f) => !NOT_PREFILLED.has(f))] as const;
export type MasterJobPrefilledField = (typeof MASTER_JOB_PREFILLED_FIELDS)[number];

// The place fields, compared by their UN/LOCODE (step 3 review, minor 2): a place is stored as
// "Name (CODE)", and the name of a code may change ("Shanghai Hongqiao International Apt (CNSHA)",
// later "Shanghai (CNSHA)") - the same port all the same. Text that is no "Name (CODE)" compares as it is.
const PLACE_FIELDS = new Set<string>(["pol", "pod"]);
const sameAs = (key: string) => (value: string) => (PLACE_FIELDS.has(key) ? (placeCodeOf(value) ?? value) : value);

/** When a house was last written, for which house's text a place agreed on by code takes; 0 when unknown. */
const writtenAt = (house: Record<string, unknown>): number => {
  const at = house.updatedAt ?? house.createdAt;
  const time = at instanceof Date ? at.getTime() : typeof at === "string" ? Date.parse(at) : NaN;
  return Number.isNaN(time) ? 0 : time;
};

// The synced times, each with the date it belongs to.
const TIME_OF_DATE: Partial<Record<MasterJobPrefilledField, MasterJobPrefilledField>> = {
  closingTime: "closingDate",
  vgmClosingTime: "vgmClosing",
  siClosingTime: "siClosing",
  amsDeadlineTime: "amsDeadline",
  isfDeadlineTime: "isfDeadline",
};

/**
 * The values a new master job takes from the houses it is made from: each field every one of them
 * has filled in alike. A field they differ on, or one of them leaves empty, stays empty, so linking
 * them changes nothing on any house (an empty master job field is not written onto a house). A place
 * agrees by its code, and takes the text of the house written last; linking leaves a house's place
 * that has the master job's code as it is (linkedHouseData, mock council S4-7). A time comes only
 * with its date: on its own it would be a time of no day.
 */
export function agreedHouseValues(houses: readonly Record<string, unknown>[]): Partial<Record<MasterJobPrefilledField, string>> {
  const out: Partial<Record<MasterJobPrefilledField, string>> = {};
  if (houses.length === 0) return out;
  // Newest first: where the houses agree on a place by its code, its text is the latest one written.
  const newest = [...houses].sort((a, b) => writtenAt(b) - writtenAt(a));
  for (const key of MASTER_JOB_PREFILLED_FIELDS) {
    const value = newest[0]![key];
    if (typeof value !== "string" || value === "") continue;
    const compared = sameAs(key);
    if (newest.every((h) => typeof h[key] === "string" && compared(h[key] as string) === compared(value))) out[key] = value;
  }
  for (const [time, date] of Object.entries(TIME_OF_DATE) as [MasterJobPrefilledField, MasterJobPrefilledField][]) {
    if (!(date in out)) delete out[time];
  }
  return out;
}

/**
 * The synced values a house just linked takes, without a place it already has by the same code: an
 * older house's "Shanghai Hongqiao International Apt (CNSHA)" is the master job's "Shanghai (CNSHA)",
 * and rewriting its text would change it, with a History entry, for no new port (mock council S4-7).
 */
export function linkedHouseData(
  synced: Partial<Record<MasterJobSyncedField, string | null>>,
  house: Record<string, unknown>,
): Partial<Record<MasterJobSyncedField, string | null>> {
  const out = { ...synced };
  for (const key of ["pol", "pod"] as const) {
    const value = out[key];
    const own = house[key];
    if (typeof value !== "string" || typeof own !== "string" || own === value) continue;
    const code = placeCodeOf(value);
    if (code && placeCodeOf(own) === code) delete out[key];
  }
  return out;
}

export interface MasterContainer {
  containerNumber: string;
  sealNumber: string;
  type: string;
  shipmentIds: string[];
}

const blankLine = (): ContainerLine => ({
  containerNumber: "",
  sealNumber: "",
  type: "",
  teu: "",
  packages: "",
  packageType: "",
  grossWeight: "",
  volume: "",
});

/**
 * A house's container list after applying the master job's containers, or null
 * when the master job has nothing to say about this house (no container
 * assigned to it and none of its containers came from the master job).
 *
 * Assigned containers come first, taking number, seal and type from the master
 * job; a house row with the same number keeps its id and cargo figures
 * (packages, weight, volume), so its cargo lines stay attached. A house row
 * whose number is on the master job but no longer assigned to this house is
 * dropped. Containers the master job does not know about are kept as they are.
 */
export function houseContainerLines(
  shipmentId: string,
  house: ContainerLine[],
  masterContainers: MasterContainer[],
): ContainerLine[] | null {
  const masterNumbers = new Set(masterContainers.map((c) => normalizeContainerNumber(c.containerNumber)));
  const assigned = masterContainers.filter((c) => c.shipmentIds.includes(shipmentId));
  const fromMaster = (l: ContainerLine) => masterNumbers.has(normalizeContainerNumber(l.containerNumber));
  if (assigned.length === 0 && !house.some(fromMaster)) return null;

  const byNumber = new Map(house.map((l) => [normalizeContainerNumber(l.containerNumber), l]));
  const lines = assigned.map((c) => {
    const match = byNumber.get(normalizeContainerNumber(c.containerNumber));
    return {
      ...(match ?? blankLine()),
      containerNumber: c.containerNumber,
      sealNumber: c.sealNumber,
      type: c.type,
    };
  });
  return [...lines, ...house.filter((l) => !fromMaster(l))];
}

/**
 * The legacy "Container's Count/Length/Type (1–4)" columns for a house, grouped
 * from its assigned containers in first-seen order: two 40' HC and one 20' GP
 * become group 1 = 2 × 40 HC, group 2 = 1 × 20 GP. All four groups are always
 * returned so a group that disappeared is cleared.
 */
export function legacyContainerGroups(types: string[]): Record<string, string> {
  const counts = new Map<string, number>();
  for (const t of types.map((x) => x.trim()).filter(Boolean)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const groups = [...counts.entries()].slice(0, 4);
  const out: Record<string, string> = {};
  for (let i = 0; i < 4; i++) {
    const [type, count] = groups[i] ?? ["", 0];
    const [size, kind] = type.split(" ");
    out[`containerCount${i + 1}`] = count ? String(count) : "";
    out[`containerLength${i + 1}`] = (size ?? "").replace("'", "");
    out[`containerType${i + 1}`] = kind ?? "";
  }
  return out;
}

/** The load type whose containers come from the linked shipments instead of the master job. */
export const FULL_LOAD = "Full Load";

export interface HouseContainerRow {
  shipmentId: string;
  containerNumber: string;
  sealNumber: string;
  type: string;
}

/**
 * A Full Load master job's containers, read live from its houses: one line per
 * container number, assigned to every house that carries it. Seal and type come
 * from the first house that has them filled in. Rows without a number can't be
 * told apart, so they are left out.
 */
export function containersFromHouses(rows: HouseContainerRow[]): MasterContainer[] {
  const byNumber = new Map<string, MasterContainer>();
  for (const r of rows) {
    const key = normalizeContainerNumber(r.containerNumber);
    if (!key) continue;
    const line = byNumber.get(key);
    if (!line) {
      byNumber.set(key, { containerNumber: key, sealNumber: r.sealNumber, type: r.type, shipmentIds: [r.shipmentId] });
      continue;
    }
    if (!line.shipmentIds.includes(r.shipmentId)) line.shipmentIds.push(r.shipmentId);
    if (!line.sealNumber) line.sealNumber = r.sealNumber;
    if (!line.type) line.type = r.type;
  }
  return [...byNumber.values()];
}

/** Load Type is chosen once: it can be set while empty, never switched afterwards. */
export function isLoadTypeChange(current: string, next: string | undefined): boolean {
  return next !== undefined && current.trim() !== "" && next !== current;
}
