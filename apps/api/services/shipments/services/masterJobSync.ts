import { normalizeContainerNumber } from "./cargoProjection";
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
  "serviceName",
  "loadType",
  "shippingLine",
  "estimatedDeparture",
  "estimatedArrival",
  "actualDeparture",
  "actualArrival",
  "etaWarehouse",
  "warehouseReceivedDate",
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

export function formatMczNumber(n: number): string {
  return `MCZ${String(n).padStart(8, "0")}`;
}

/** Numeric part of an MCZ number, or 0 for anything that is not one. */
export function mczSequence(mczNumber: string): number {
  if (!mczNumber.startsWith("MCZ")) return 0;
  const n = parseInt(mczNumber.slice(3), 10);
  return Number.isNaN(n) ? 0 : n;
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
