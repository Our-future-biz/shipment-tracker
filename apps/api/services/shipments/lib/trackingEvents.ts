// What a tracking event is, and who may set what with one (Council Outlay 8, D3, D4, D7, D11). Pure,
// so it is unit-tested.
//
// ATA and ATD are the tax date and lock the ČNB rate: a machine only ever proposes them, a person
// confirms, and the confirmation goes through the normal shipment update with its invoice lock.
// A source may set ETD and ETA while the actual date is empty. Gate in and out belong to the
// warehouse and a road job's delivery to Trucking: they are never recorded by hand here.

import type { ShipmentRecord } from "../schemas/shipment.schema";

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

/** A truck's stamps are set in Trucking: its jobs record nothing here. */
export const isRoadJob = (s: { tradeDirection: string; freightMode: string }): boolean =>
  s.tradeDirection.trim().toLowerCase() === "domestic" || /road/i.test(s.freightMode);

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

/** What this person may record on this shipment. */
export function recordableKinds(shipment: { tradeDirection: string; freightMode: string }, mayChangeDetails: boolean): RecordableKind[] {
  if (isRoadJob(shipment)) return [];
  return (Object.keys(TRACKING_KINDS) as TrackingKind[]).flatMap((kind) => {
    const def = kindDef(kind);
    if (!def.group || (!mayChangeDetails && !def.department)) return [];
    return [{
      kind,
      label: def.label,
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
export function recordRefusal(input: RecordInput, shipment: { tradeDirection: string; freightMode: string }, today: string): string | null {
  if (!isTrackingKind(input.kind) || !kindDef(input.kind).group) return `"${input.kind}" can't be recorded here`;
  const def = kindDef(input.kind);
  if (isRoadJob(shipment)) return "A road job's stamps are set in Trucking";
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
  // A road job's delivery is Trucking's stamp.
  if (field === "actualDeliveryDate" && isRoadJob(shipment)) return "none";
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
  // "Departed from port" is read on the desk as leaving the POD for the hub: it sets no ATD.
  imp_departed_port: "terminal_out",
  imp_arrived_hub: "hub_arrived",
  imp_customs_cleared: "customs_released",
  imp_delivered: "delivered",
};

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
  now: Date;
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
    if (field === "customsStatus") {
      if (value === CUSTOMS_CLEARED) out.push({ kind, occurredOn: ctx.today, occurredAt: ctx.now, source, effect: "none", effectField: "", effectValue: null, note: "" });
    } else if (field === "mrn" || field === "houseBolRelease") {
      out.push({ kind, occurredOn: ctx.today, occurredAt: ctx.now, source, effect: "none", effectField: "", effectValue: null, note: field === "mrn" ? value : "" });
    } else {
      // A stamp written on its own day was written as it happened; a typed date says nothing of the hour.
      const stamped = source !== "user" && source !== "master_job" && value === ctx.today;
      out.push({ kind, occurredOn: value, occurredAt: stamped ? ctx.now : null, source, effect: "applied", effectField: field, effectValue: value, note: "" });
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
