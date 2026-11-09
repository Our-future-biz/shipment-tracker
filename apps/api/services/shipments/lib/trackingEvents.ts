// What a tracking event is, and who may set what with one (Council Outlay 8, D3, D4, D7, D11). Pure,
// so it is unit-tested.
//
// ATA and ATD are the tax date and lock the ČNB rate: a machine only ever proposes them, a person
// confirms, and the confirmation goes through the normal shipment update with its invoice lock.
// A source may set ETD and ETA while the actual date is empty. Gate in and out belong to the
// warehouse and a Trucking job's delivery to Trucking: they are never recorded by hand here.

import { isDeliveryDated } from "../../../lib/deliveryDated";
import type { ShipmentRecord } from "../schemas/shipment.schema";
import { TICK_NOTICES } from "./customerNotice";

export const CUSTOMS_CLEARED = "Customs Cleared/Released";

export type TrackingEventGroup = "milestone" | "exception" | "note";

interface KindDef {
  label: string;
  /** What people may record; left out, only the app writes it. */
  group?: TrackingEventGroup;
  /** The shipment field the event sets. */
  field?: "actualDeparture" | "actualArrival" | "actualDeliveryDate" | "estimatedDeparture" | "estimatedArrival" | "customsStatus";
  /** Needs a reason. */
  reason?: boolean;
  /** Its day is a plan, so it may lie ahead. */
  planned?: boolean;
  /** Customs keeps these up, whoever the shipment's people are. */
  department?: boolean;
}

export const TRACKING_KINDS = {
  booking_confirmed: { label: "Booking confirmed", group: "milestone" },
  cargo_ready: { label: "Cargo ready", group: "milestone" },
  picked_up: { label: "Picked up", group: "milestone" },
  loaded: { label: "Loaded on board", group: "milestone" },
  departed: { label: "Departed", group: "milestone", field: "actualDeparture" },
  ts_arrived: { label: "Transhipment: arrived", group: "milestone" },
  ts_departed: { label: "Transhipment: departed", group: "milestone" },
  arrived: { label: "Arrived", group: "milestone", field: "actualArrival" },
  discharged: { label: "Discharged", group: "milestone" },
  terminal_out: { label: "Left the terminal", group: "milestone" },
  hub_arrived: { label: "Arrived at HUB", group: "milestone" },
  customs_released: { label: "Customs cleared", group: "milestone", field: "customsStatus", department: true },
  delivered: { label: "Delivered", group: "milestone", field: "actualDeliveryDate" },
  empty_returned: { label: "Empty returned", group: "milestone" },
  etd_changed: { label: "ETD changed", group: "milestone", field: "estimatedDeparture", reason: true, planned: true },
  eta_changed: { label: "ETA changed", group: "milestone", field: "estimatedArrival", reason: true, planned: true },
  delayed: { label: "Delayed", group: "exception", reason: true },
  rolled: { label: "Rolled", group: "exception", reason: true },
  hold: { label: "Customs hold", group: "exception", reason: true, department: true },
  note: { label: "Note", group: "note", reason: true },
  gate_in: { label: "Gate in" },
  gate_out: { label: "Gate out" },
  mrn_issued: { label: "MRN issued" },
  hbl_released: { label: "House BoL released" },
  delivery_advised: { label: "Delivery advised" },
  haulier_confirmed: { label: "Haulier confirmed" },
  pod_received: { label: "POD received" },
} as const satisfies Record<string, KindDef>;

export type TrackingKind = keyof typeof TRACKING_KINDS;

const kindDef = (kind: TrackingKind): KindDef => TRACKING_KINDS[kind];

export const isTrackingKind = (kind: string): kind is TrackingKind => Object.hasOwn(TRACKING_KINDS, kind);

export const TRACKING_SOURCES = ["user", "master_job", "warehouse", "trucking", "customs", "document", "carrier", "system"] as const;
export type TrackingSource = (typeof TRACKING_SOURCES)[number];

/** How a source shows beside who recorded it; a person needs no word. */
export const SOURCE_LABELS: Record<TrackingSource, string> = {
  user: "",
  master_job: "Master job",
  warehouse: "Warehouse",
  trucking: "Trucking",
  customs: "Customs",
  document: "Document read",
  carrier: "Carrier",
  system: "",
};

/** The fields that say whether a job is Trucking's and how it travels. */
export interface JobMode {
  tradeDirection: string;
  freightMode: string;
  department?: string | null;
}

/**
 * A Trucking job: a Domestic job or one of the Road Department, the same jobs that are dated by
 * their delivery (lib/deliveryDated). Its stamps are set in Trucking, so it records nothing here.
 * An international Road Freight import or export is not one: it is taxed by its ATA or ATD, like
 * any other.
 */
export const isTruckingJob = (s: { tradeDirection: string; department?: string | null }): boolean => isDeliveryDated(s);

/**
 * Trucking's stamps of a consignment's truck (the haulier confirmed it, it picked up). Trucking
 * stamps every consignment, the delivery truck of a sea import too; only on a Trucking job is
 * that truck the job's own pick-up, at the shipper's end.
 */
export const TRUCKING_STAMP_KINDS: ReadonlySet<string> = new Set<TrackingKind>(["haulier_confirmed", "picked_up"]);

export type FreightKind = "sea" | "air" | "rail" | "road";

/** How a job travels, by its freight mode: sea when nothing says otherwise. */
export function freightKindOf(s: JobMode): FreightKind {
  if (isTruckingJob(s) || /road/i.test(s.freightMode)) return "road";
  if (/^air/i.test(s.freightMode.trim())) return "air";
  if (/^rail/i.test(s.freightMode.trim())) return "rail";
  return "sea";
}

const LABELS_BY_MODE: Partial<Record<FreightKind, Partial<Record<TrackingKind, string>>>> = {
  air: { loaded: "Loaded on the flight", discharged: "Ready for pick-up", terminal_out: "Left the airport", ts_arrived: "Transit: arrived", ts_departed: "Transit: departed" },
  rail: { loaded: "Loaded on the train", departed: "Departed the terminal", arrived: "Arrived at the terminal", discharged: "Unloaded", ts_arrived: "Transfer: arrived", ts_departed: "Transfer: departed" },
};

/** A kind's name on a job of this mode: a flight has no vessel to be loaded on. */
export const labelOfKind = (kind: TrackingKind, s: JobMode): string =>
  LABELS_BY_MODE[freightKindOf(s)]?.[kind] ?? TRACKING_KINDS[kind].label;

export const isExceptionKind = (kind: string): boolean => isTrackingKind(kind) && kindDef(kind).group === "exception";

/** May this kind be recorded by someone who can't change the shipment's details? */
export const isDepartmentKind = (kind: TrackingKind): boolean => !!kindDef(kind).department;

/** What an event of this kind closes. */
export const EXCEPTIONS_CLOSED_BY: Partial<Record<TrackingKind, TrackingKind[]>> = {
  arrived: ["delayed", "rolled"],
  departed: ["rolled"],
  customs_released: ["hold"],
};

export interface RecordableKind {
  kind: string;
  label: string;
  group: TrackingEventGroup;
  reasonRequired: boolean;
  /** The shipment field it sets, in the words people use; "" when it sets none. */
  sets: string;
  /** It sets the job's tax date or what follows from it, refused once invoiced. */
  taxDate: boolean;
}

const SETS_LABEL: Record<NonNullable<KindDef["field"]>, string> = {
  actualDeparture: "ATD",
  actualArrival: "ATA",
  actualDeliveryDate: "delivery date",
  estimatedDeparture: "ETD",
  estimatedArrival: "ETA",
  customsStatus: "customs status",
};

/** A shipment field in the words people use; "" for none. */
export const setsWord = (field: string): string => SETS_LABEL[field as NonNullable<KindDef["field"]>] ?? "";

/** What this person may record on this shipment. */
export function recordableKinds(shipment: JobMode, mayChangeDetails: boolean): RecordableKind[] {
  if (isTruckingJob(shipment)) return [];
  const air = freightKindOf(shipment) === "air";
  return (Object.keys(TRACKING_KINDS) as TrackingKind[]).flatMap((kind) => {
    const def = kindDef(kind);
    if (!def.group || (!mayChangeDetails && !def.department)) return [];
    // A plane leaves no empty to return.
    if (air && kind === "empty_returned") return [];
    return [{
      kind,
      label: labelOfKind(kind, shipment),
      group: def.group,
      reasonRequired: !!def.reason,
      sets: def.field ? SETS_LABEL[def.field] : "",
      taxDate: def.field === "actualArrival" || def.field === "actualDeparture",
    }];
  });
}

export interface RecordInput {
  kind: string;
  occurredOn: string;
  note: string;
}

/** Why this can't be recorded, or null. The one recording is checked apart (the details rule). */
export function recordRefusal(input: RecordInput, shipment: JobMode, today: string): string | null {
  if (!isTrackingKind(input.kind) || !kindDef(input.kind).group) return `"${input.kind}" can't be recorded here`;
  const def = kindDef(input.kind);
  if (isTruckingJob(shipment)) return "A Trucking job's stamps are set in Trucking";
  if (def.reason && !input.note.trim()) return `${def.label} needs a reason`;
  // A port ahead of Prague can already be on tomorrow.
  if (!def.planned && input.occurredOn > addDay(today)) return `${def.label} can't be in the future`;
  return null;
}

const addDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export type EffectMode = "none" | "apply" | "propose";

export interface EventEffect {
  mode: EffectMode;
  field: string;
  /** The day it writes; null for the customs status. */
  value: string | null;
}

const NO_EFFECT: EventEffect = { mode: "none", field: "", value: null };

/** Whether a source's word is enough for this field: set, propose or leave alone. */
function writeRule(source: TrackingSource, field: NonNullable<KindDef["field"]>, shipment: ShipmentRecord): EffectMode {
  if (source !== "carrier" && source !== "document") return "apply";
  if (field === "estimatedDeparture") return shipment.actualDeparture ? "none" : "apply";
  if (field === "estimatedArrival") return shipment.actualArrival ? "none" : "apply";
  if (field === "customsStatus") return "none";
  // A Trucking job's delivery is Trucking's stamp.
  if (field === "actualDeliveryDate" && isTruckingJob(shipment)) return "none";
  return "propose";
}

/** What an event of this kind from this source does to the shipment. */
export function effectOf(kind: TrackingKind, source: TrackingSource, shipment: ShipmentRecord, day: string): EventEffect {
  const field = kindDef(kind).field;
  if (!field) return NO_EFFECT;
  const mode = writeRule(source, field, shipment);
  if (mode === "none") return NO_EFFECT;
  return { mode, field, value: field === "customsStatus" ? null : day };
}

/** Whether applying the effect would change anything. */
export function effectChanges(effect: EventEffect, shipment: ShipmentRecord): boolean {
  if (!effect.field) return false;
  const current = shipment[effect.field as keyof ShipmentRecord];
  return effect.field === "customsStatus" ? current !== CUSTOMS_CLEARED : current !== effect.value;
}

/** A checklist tick that is also a dated fact: ticking it records the event, with its date. */
export const TICK_EVENTS: Readonly<Record<string, TrackingKind>> = {
  imp_cargo_readiness: "cargo_ready",
  exp_cargo_readiness: "cargo_ready",
  imp_cargo_shipped: "departed",
  // "Cargo departed from Port of Discharge" is leaving the Port of Discharge for the hub: it sets no ATD.
  imp_departed_port: "terminal_out",
  imp_arrived_hub: "hub_arrived",
  imp_customs_cleared: "customs_released",
  imp_delivered: "delivered",
};

/** The ticks the app writes itself, with what writes them (ticksFromChanges). */
export const SELF_TICKS: Readonly<Record<string, string>> = {
  imp_billed: "Billed ticks itself when the job is invoiced",
  exp_billed: "Billed ticks itself when the job is invoiced",
  imp_delivered: "Delivered ticks itself when the delivery date is set",
};

/**
 * Why a task can't be ticked by itself, or null. A tick that is a dated fact comes with its event,
 * one that means the customer was told with the notice, and Billed and Delivered tick themselves;
 * a Trucking job records no event here, so its dated ticks stay plain ticks.
 */
export function plainTickRefusal(taskKey: string, shipment: JobMode): string | null {
  if (Object.hasOwn(TICK_NOTICES, taskKey)) return "This tick is written when the customer is told: use Tell the customer on the Tracking tab";
  const kind = Object.hasOwn(TICK_EVENTS, taskKey) ? TICK_EVENTS[taskKey] : undefined;
  if (kind && !isTruckingJob(shipment)) return `Record "${labelOfKind(kind, shipment)}" on the Tracking tab: the tick comes with its date`;
  return Object.hasOwn(SELF_TICKS, taskKey) ? SELF_TICKS[taskKey]! : null;
}

// The fields whose change is itself a fact, and what the app stores of it.
const KIND_OF_FIELD: Record<string, TrackingKind> = {
  actualDeparture: "departed",
  actualArrival: "arrived",
  actualDeliveryDate: "delivered",
  warehouseReceivedDate: "gate_in",
  warehouseReleasedDate: "gate_out",
  estimatedDeparture: "etd_changed",
  estimatedArrival: "eta_changed",
  customsStatus: "customs_released",
  mrn: "mrn_issued",
  houseBolRelease: "hbl_released",
};

const SOURCE_OF_FIELD: Partial<Record<string, TrackingSource>> = {
  actualDeliveryDate: "trucking",
  warehouseReceivedDate: "warehouse",
  warehouseReleasedDate: "warehouse",
  customsStatus: "customs",
  mrn: "customs",
};

/** A fact the app stores on its own when a shipment changes. */
export interface ChangeEvent {
  kind: TrackingKind;
  occurredOn: string;
  occurredAt: Date | null;
  source: TrackingSource;
  effect: "none" | "applied";
  effectField: string;
  effectValue: string | null;
  note: string;
}

interface ChangeContext {
  /** A person's own edit, rather than the app's. */
  byPerson: boolean;
  /** Who wrote it, when the caller knows better than the field does (a master job's sync). */
  origin?: TrackingSource;
  today: string;
  /**
   * The moment it happened, when the caller knows it. Left out, the fact has no hour: the moment
   * of the write isn't it (a gate-in at 08:10 can reach here with a retry at 13:40).
   */
  at?: Date;
}

const filled = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** The events a write of `changes` onto `before` is worth. */
export function eventsFromChanges(before: Record<string, unknown>, changes: Record<string, unknown>, ctx: ChangeContext): ChangeEvent[] {
  const out: ChangeEvent[] = [];
  for (const [field, kind] of Object.entries(KIND_OF_FIELD)) {
    if (!(field in changes)) continue;
    const value = changes[field];
    const old = before[field];
    if (!filled(value) || value === old) continue;
    const source = ctx.origin ?? (ctx.byPerson ? "user" : (SOURCE_OF_FIELD[field] ?? "system"));
    const planned = field === "estimatedDeparture" || field === "estimatedArrival";
    // A plan's first filling-in is no change of plan.
    if (planned && !filled(old)) continue;
    const occurredAt = ctx.at ?? null;
    if (field === "customsStatus") {
      if (value === CUSTOMS_CLEARED) out.push({ kind, occurredOn: ctx.today, occurredAt, source, effect: "none", effectField: "", effectValue: null, note: "" });
    } else if (field === "mrn" || field === "houseBolRelease") {
      out.push({ kind, occurredOn: ctx.today, occurredAt, source, effect: "none", effectField: "", effectValue: null, note: field === "mrn" ? value : "" });
    } else {
      out.push({ kind, occurredOn: value, occurredAt, source, effect: "applied", effectField: field, effectValue: value, note: "" });
    }
  }
  return out;
}

/** The checklist ticks a change of the shipment makes true on their own. */
export function ticksFromChanges(before: Record<string, unknown>, changes: Record<string, unknown>, tradeDirection: string | null | undefined): string[] {
  const isExport = (tradeDirection ?? "").trim().toLowerCase() === "export";
  const out: string[] = [];
  if (changes.invoicingStatus === "Invoiced" && before.invoicingStatus !== "Invoiced") out.push(isExport ? "exp_billed" : "imp_billed");
  if (filled(changes.actualDeliveryDate) && changes.actualDeliveryDate !== before.actualDeliveryDate && !isExport) out.push("imp_delivered");
  return out;
}

const czDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

const LAST_FACT_COLUMNS: readonly { field: "actualDeparture" | "actualArrival" | "warehouseReceivedDate" | "warehouseReleasedDate" | "actualDeliveryDate"; kind: TrackingKind }[] = [
  { field: "actualDeparture", kind: "departed" },
  { field: "actualArrival", kind: "arrived" },
  { field: "warehouseReceivedDate", kind: "gate_in" },
  { field: "warehouseReleasedDate", kind: "gate_out" },
  { field: "actualDeliveryDate", kind: "delivered" },
];

/** The actual dates a fact stands on: corrected or cleared, what was stored of the old one no longer holds. */
export const HELD_FACT_FIELDS = LAST_FACT_COLUMNS.map((c) => c.field);
export type HeldFactField = (typeof LAST_FACT_COLUMNS)[number]["field"];

const isHeldFactField = (field: string): field is HeldFactField => (HELD_FACT_FIELDS as readonly string[]).includes(field);

/** The actual dates a write of `changes` onto `before` sets, corrects or clears: null for cleared. */
export function heldFieldChanges(before: Record<string, unknown>, changes: Record<string, unknown>): { field: HeldFactField; value: string | null }[] {
  return HELD_FACT_FIELDS.flatMap((field) => {
    if (!(field in changes)) return [];
    const value = filled(changes[field]) ? changes[field] : null;
    const old = filled(before[field]) ? before[field] : null;
    return value === old ? [] : [{ field, value }];
  });
}

type LastEventDates = Partial<Record<HeldFactField, string | null>>;

/** A stored event, as far as the last event goes by it. */
interface LastEventFact {
  kind: string;
  occurredOn: string;
  source: string;
  effect?: string;
  effectField?: string;
  effectValue?: string | null;
}

/** Whether a stored fact still stands: one that set an actual date stands while the shipment holds that day. */
function stillHolds(dates: LastEventDates, e: LastEventFact): boolean {
  if (e.effect !== "applied" || !e.effectField || !isHeldFactField(e.effectField) || !(e.effectField in dates)) return true;
  return (dates[e.effectField] ?? null) === (e.effectValue ?? null);
}

/**
 * The list's "Last event": what happened last on the shipment, from its latest stored event and
 * its actual dates (jobs older than the events have only those). The later step wins a day's tie.
 * An event that set a date the shipment no longer holds (corrected or cleared since) didn't happen.
 */
export function lastEventOf(dates: LastEventDates, stored: LastEventFact | null): string {
  const event = stored && stillHolds(dates, stored) ? stored : null;
  let day = "";
  let kind = "";
  let source = "";
  for (const column of LAST_FACT_COLUMNS) {
    const value = dates[column.field];
    if (value && value >= day) {
      day = value;
      kind = column.kind;
      source = "";
    }
  }
  if (event && isTrackingKind(event.kind) && event.occurredOn >= day) {
    day = event.occurredOn;
    kind = event.kind;
    source = SOURCE_LABELS[event.source as TrackingSource] ?? "";
  }
  if (!day) return "";
  return [`${TRACKING_KINDS[kind as TrackingKind].label} ${czDay(day)}`, source].filter(Boolean).join(" · ");
}

