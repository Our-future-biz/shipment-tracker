// What a read tracking document says, as facts a person can look over and keep (Council Outlay 8,
// D18): arrival notices, carrier delay notices, terminal mails, rail and airline notices, pasted or
// uploaded. A document is a source like any other: it proposes ATA and ATD, it may set ETD and ETA
// while the actual date is empty, and the day is the one it prints (D5). Pure, so it is unit-tested.

import { isRealYmd } from "../../../lib/businessDate";
import { effectChanges, effectOf, labelOfKind, recordRefusal, setsWord, type EventEffect, type TrackingKind } from "./trackingEvents";
import type { ShipmentRecord } from "../schemas/shipment.schema";

export interface ReadFact {
  kind: string;
  label: string;
  occurredOn: string;
  place: string;
  vessel: string;
  note: string;
  /** What keeping it does: sets a date, proposes one, or only records the fact. */
  effect: "apply" | "propose" | "none";
  /** The date in words ("ATA"); "" when it touches none. */
  sets: string;
  /** Read from this document before: keeping it again adds nothing. */
  alreadyKept: boolean;
  /** Why it can't be kept ("Arrived can't be in the future"); "" when it can. */
  refusal: string;
}

/** The vessel and voyage a notice names, when they differ from the job's and nothing has sailed yet. */
export interface VesselChange {
  vessel: string;
  voyage: string;
}

export interface ReadingPreview {
  facts: ReadFact[];
  lastFreeDayChange: LastFreeDayChange | null;
  vesselChange: VesselChange | null;
  containersFound: string[];
  /** The document names containers and none of them is on this shipment: probably the wrong one. */
  otherShipment: boolean;
}

const DATED: readonly { field: string; kind: TrackingKind; place?: "pol" | "pod" | "transhipment"; note?: string }[] = [
  { field: "Loaded On Board", kind: "loaded", place: "pol" },
  { field: "ATD", kind: "departed", place: "pol" },
  { field: "Transhipment Arrived", kind: "ts_arrived", place: "transhipment" },
  { field: "Transhipment Departed", kind: "ts_departed", place: "transhipment" },
  { field: "ATA", kind: "arrived", place: "pod" },
  { field: "Discharged", kind: "discharged", place: "pod" },
  { field: "Gate Out", kind: "terminal_out", place: "pod" },
  { field: "Delivered", kind: "delivered" },
  { field: "Empty Returned", kind: "empty_returned" },
  { field: "New ETD", kind: "etd_changed", note: "From a document" },
  { field: "New ETA", kind: "eta_changed", note: "From a document" },
];

const czDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

const CONTAINER = /[A-Z]{4}\s?-?\s?\d{6}\s?-?\s?\d/g;

/** The container numbers a document names, in one form. */
export function containersIn(text: string | undefined): string[] {
  const found = (text ?? "").toUpperCase().match(CONTAINER) ?? [];
  return [...new Set(found.map((c) => c.replace(/[^A-Z0-9]/g, "")))];
}

/** A document's word on a date the shipment already has that day for is no news: nothing to set or confirm. */
export function documentEffect(kind: TrackingKind, shipment: ShipmentRecord, day: string): EventEffect {
  const effect = effectOf(kind, "document", shipment, day);
  return effect.mode !== "none" && !effectChanges(effect, shipment) ? { mode: "none", field: "", value: null } : effect;
}

/** What a notice would change of the vessel and voyage: only while the actual departure is empty (D3). */
function vesselChangeOf(vessel: string, voyage: string, shipment: ShipmentRecord): VesselChange | null {
  if (shipment.actualDeparture) return null;
  const differs = (read: string, held: string) => !!read && read.toUpperCase() !== (held ?? "").trim().toUpperCase();
  if (!differs(vessel, shipment.vessel) && !differs(voyage, shipment.voyage)) return null;
  return { vessel: vessel || shipment.vessel, voyage: voyage || shipment.voyage };
}

/** The facts in what was read, in the order they happen. */
export function readingPreview(extracted: Record<string, string>, shipment: ShipmentRecord, shipmentContainers: readonly string[], keptIds: ReadonlySet<string>, today: string): ReadingPreview {
  const value = (field: string) => (extracted[field] ?? "").trim();
  const vessel = [value("Vessel"), value("Voyage")].filter(Boolean).join(" ");
  const placeOf = { pol: shipment.pol, pod: shipment.pod, transhipment: value("Transhipment Port") };

  const facts: ReadFact[] = [];
  const add = (kind: TrackingKind, occurredOn: string, place: string, note: string, withVessel = "") => {
    const effect = documentEffect(kind, shipment, occurredOn);
    facts.push({
      kind,
      label: labelOfKind(kind, shipment),
      occurredOn,
      place,
      vessel: withVessel,
      note,
      effect: effect.mode,
      sets: effect.mode === "none" ? "" : setsWord(effect.field),
      alreadyKept: keptIds.has(readingExternalId({ kind, occurredOn, note })),
      refusal: recordRefusal({ kind, occurredOn, note }, shipment, today) ?? "",
    });
  };

  for (const d of DATED) {
    const day = value(d.field).slice(0, 10);
    if (!isRealYmd(day)) continue;
    // The plan it announces is the plan already held: nothing moved.
    if ((d.kind === "etd_changed" && shipment.estimatedDeparture === day) || (d.kind === "eta_changed" && shipment.estimatedArrival === day)) continue;
    add(d.kind, day, d.place ? placeOf[d.place] : "", d.note ?? "", d.kind === "ts_departed" || d.kind === "departed" ? vessel : "");
  }
  const hold = value("Customs Hold");
  if (hold) add("hold", today, "", hold);
  const available = value("Available From");
  if (isRealYmd(available.slice(0, 10))) add("note", today, "", `Available from ${czDay(available.slice(0, 10))}`);
  const lastFree = value("Last Free Day");
  if (isRealYmd(lastFree.slice(0, 10))) add("note", today, "", `Last free day ${czDay(lastFree.slice(0, 10))}`);

  const containersFound = containersIn(value("Container Numbers"));
  const ours = new Set(shipmentContainers.map((c) => c.toUpperCase()));
  return { facts, lastFreeDayChange: null, vesselChange: vesselChangeOf(value("Vessel"), value("Voyage"), shipment), containersFound, otherShipment: containersFound.length > 0 && ours.size > 0 && !containersFound.some((c) => ours.has(c)) };
}

export interface LastFreeDayChange {
  day: string;
  containerIds: string[];
  containerNumbers: string[];
}

/**
 * The last free day a notice states, for the boxes it names, or every box of the job when it names
 * no container at all. A notice naming only other boxes says nothing of this job's.
 */
export function lastFreeDayChangeOf(extracted: Record<string, string>, containers: readonly { id: string; containerNumber: string; lastFreeDay?: string | null }[]): LastFreeDayChange | null {
  const day = (extracted["Last Free Day"] ?? "").trim().slice(0, 10);
  if (!isRealYmd(day) || containers.length === 0) return null;
  const named = new Set(containersIn(extracted["Container Numbers"]));
  const boxes = (named.size > 0 ? containers.filter((c) => named.has(c.containerNumber)) : containers).filter((c) => c.lastFreeDay !== day);
  if (boxes.length === 0) return null;
  return { day, containerIds: boxes.map((c) => c.id), containerNumbers: boxes.map((c) => c.containerNumber) };
}

// What a notice says with no day of its own (a customs hold, available from, the last free day) is
// dated by the day it is read, so that day is no part of what it is.
const UNDATED_KINDS: ReadonlySet<string> = new Set<TrackingKind>(["hold", "note"]);

/** The id a kept fact goes by: reading the same document again, on any day, adds nothing. */
export const readingExternalId = (fact: { kind: string; occurredOn: string; note: string }) =>
  UNDATED_KINDS.has(fact.kind) ? `document:${fact.kind}:${fact.note}` : `document:${fact.kind}:${fact.occurredOn}:${fact.note}`;
