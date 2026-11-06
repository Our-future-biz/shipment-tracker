// The Tracking tab's read model: what the shipment's dates, its audit log and its ticks say about
// where the cargo is. Nothing is stored here. Pure, so it is unit-tested.
//
// The rows are dated facts, never checklist ticks: a tick's time is the click (D1). A row with an
// actual date, from the shipment or from a recorded event, is done; a row whose planned date passed
// with nothing recorded is late. A tick moves no row.

import { addDays, businessDay, businessTime } from "../../../lib/businessDate";
import { isDeliveryDated } from "../../../lib/deliveryDated";
import type {
  ShipmentTracking,
  TrackingAttention,
  TrackingChange,
  TrackingCustomerNotice,
  TrackingEventItem,
  TrackingLeg,
  TrackingMilestone,
  TrackingRecorded,
  TrackingTaxDate,
} from "../interfaces/interfaces";
import type { ShipmentRecord } from "../schemas/shipment.schema";
import type { ShipmentAuditRecord } from "../schemas/shipmentAudit.schema";
import type { ShipmentTaskRecord } from "../schemas/shipmentTask.schema";
import type { ShipmentTrackingEventRecord } from "../schemas/shipmentTrackingEvent.schema";
import type { ShipmentCustomerNoticeRecord } from "../schemas/shipmentCustomerNotice.schema";
import { NOTICE_KINDS, isNoticeKind, toldDifferences } from "./customerNotice";
import { CUSTOMS_CLEARED, SOURCE_LABELS, TRACKING_KINDS, isExceptionKind, isRoadJob, isTrackingKind, labelOfKind, recordableKinds, setsWord, type TrackingKind, type TrackingSource } from "./trackingEvents";
import { ARRIVAL_LATE_AFTER_DAYS, DATE_MOVED_WINDOW_DAYS, EXPORT_DEPARTURE_LATE_AFTER_DAYS } from "./trackingThresholds";

type Field = keyof ShipmentRecord & string;

export { CUSTOMS_CLEARED };

const DATE_LABELS = {
  estimatedDeparture: "ETD",
  actualDeparture: "ATD",
  estimatedArrival: "ETA",
  actualArrival: "ATA",
  etaWarehouse: "ETA warehouse",
  warehouseReceivedDate: "Warehouse received",
  warehouseReleasedDate: "Warehouse released",
  plannedDeliveryDate: "Planned delivery",
  actualDeliveryDate: "Delivered",
  cargoReadinessDate: "Cargo ready",
  pickupDate: "Pick-up",
  equipmentDeliveryDate: "Equipment delivery / pick-up",
  closingDate: "Cargo closing",
  vgmClosing: "VGM closing",
  siClosing: "SI closing",
} as const satisfies Partial<Record<Field, string>>;

const ROUTING_LABELS = {
  vessel: "Vessel",
  voyage: "Voyage",
  pol: "POL",
  pod: "POD",
} as const satisfies Partial<Record<Field, string>>;

const CHANGE_LABELS: Record<string, string> = { ...DATE_LABELS, ...ROUTING_LABELS };

/** The fields the timeline reads from the audit log. */
export const TRACKING_AUDIT_FIELDS: readonly string[] = [...Object.keys(CHANGE_LABELS), "customsStatus"];

// Fields only a module or a department keeps up. Who wrote one is shown with where it comes from.
const SOURCE_OF_FIELD: Record<string, string> = {
  actualDeliveryDate: "Trucking",
  warehouseReceivedDate: "Warehouse",
  warehouseReleasedDate: "Warehouse",
  etaWarehouse: "Warehouse",
  customsStatus: "Customs",
};

interface RowSpec {
  key: string;
  label: string;
  basis?: string;
  leg: TrackingLeg;
  place?: string;
  planned?: Field;
  plannedTime?: Field;
  actual?: Field;
  /** The recorded event that says it happened. */
  event?: string;
  /** The event's note is what there is to say on the row. */
  noteAsDetail?: boolean;
  /** Shown only when it holds something. */
  optional?: boolean;
}

const CUSTOMS_KEY = "customs";

function rowsOf(s: ShipmentRecord): RowSpec[] {
  const isExport = s.tradeDirection.trim().toLowerCase() === "export";
  const road = isRoadJob(s);
  const atOrigin = isExport ? "origin" : "destination";

  const label = (kind: TrackingKind) => labelOfKind(kind, s);
  const confirmed: RowSpec = { key: "confirmed", label: label("haulier_confirmed"), leg: "origin", event: "haulier_confirmed", optional: true };
  const booking: RowSpec = { key: "booking", label: "Booking confirmed", leg: "origin", event: "booking_confirmed", optional: true };
  const cargoReady: RowSpec = { key: "cargoReady", label: "Cargo ready", leg: "origin", planned: "cargoReadinessDate", event: "cargo_ready", optional: true };
  const pickup: RowSpec = { key: "pickup", label: "Picked up", leg: "origin", planned: "pickupDate", plannedTime: "pickupTime", event: "picked_up", optional: !road };
  const equipment: RowSpec = { key: "equipment", label: "Equipment delivery / pick-up", leg: atOrigin, planned: "equipmentDeliveryDate", plannedTime: "equipmentDeliveryTime", optional: true };
  const loaded: RowSpec = { key: "loaded", label: label("loaded"), leg: "main", place: s.pol, event: "loaded", optional: true };
  const departed: RowSpec = { key: "departed", label: label("departed"), basis: "ETD / ATD", leg: "main", place: s.pol, planned: "estimatedDeparture", actual: "actualDeparture", event: "departed", optional: road };
  const arrived: RowSpec = { key: "arrived", label: label("arrived"), basis: "ETA / ATA", leg: "main", place: s.pod, planned: "estimatedArrival", actual: "actualArrival", event: "arrived", optional: road };
  const discharged: RowSpec = { key: "discharged", label: label("discharged"), leg: "main", place: s.pod, event: "discharged", optional: true };
  const terminalOut: RowSpec = { key: "terminalOut", label: label("terminal_out"), leg: "destination", place: s.pod, event: "terminal_out", optional: true };
  const hub: RowSpec = { key: "hub", label: "Arrived at HUB", leg: "destination", place: s.hub, event: "hub_arrived", optional: true };
  const customs: RowSpec = { key: CUSTOMS_KEY, label: "Customs cleared", leg: atOrigin, event: "customs_released", optional: road };
  const gateIn: RowSpec = { key: "gateIn", label: "Gate in", basis: "ETA warehouse", leg: atOrigin, place: s.hub, planned: "etaWarehouse", actual: "warehouseReceivedDate", event: "gate_in", optional: true };
  const gateOut: RowSpec = { key: "gateOut", label: "Gate out", leg: atOrigin, place: s.hub, actual: "warehouseReleasedDate", event: "gate_out", optional: true };
  const delivered: RowSpec = {
    key: "delivered",
    label: "Delivered",
    leg: "destination",
    place: s.destination,
    planned: "plannedDeliveryDate",
    plannedTime: "plannedDeliveryTime",
    actual: "actualDeliveryDate",
    event: "delivered",
    optional: isExport,
  };
  const advised: RowSpec = { key: "advised", label: "Delivery advised", leg: "destination", event: "delivery_advised", noteAsDetail: true, optional: true };
  const pod: RowSpec = { key: "pod", label: "POD received", leg: "destination", event: "pod_received", noteAsDetail: true, optional: true };
  const emptyReturned: RowSpec = { key: "emptyReturned", label: "Empty returned", leg: "destination", event: "empty_returned", optional: true };

  if (isExport) {
    const closings: RowSpec[] = [
      { key: "closing", label: "Cargo closing", leg: "origin", planned: "closingDate", plannedTime: "closingTime", optional: true },
      { key: "vgmClosing", label: "VGM closing", leg: "origin", planned: "vgmClosing", plannedTime: "vgmClosingTime", optional: true },
      { key: "siClosing", label: "SI closing", leg: "origin", planned: "siClosing", plannedTime: "siClosingTime", optional: true },
    ];
    return [booking, confirmed, cargoReady, pickup, equipment, gateIn, gateOut, customs, ...closings, loaded, departed, arrived, discharged, terminalOut, hub, advised, delivered, pod, emptyReturned];
  }
  return [booking, confirmed, cargoReady, pickup, loaded, departed, arrived, discharged, terminalOut, customs, hub, equipment, gateIn, gateOut, advised, delivered, pod, emptyReturned];
}

const TRANSHIPMENT_KINDS = new Set<string>(["ts_arrived", "ts_departed"]);
// What the Changes card already says, unless somebody gave a reason.
const PLAN_CHANGE_KINDS = new Set<string>(["eta_changed", "etd_changed"]);

const dayMs = 86_400_000;

/** Whole days from one calendar day to another. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);

const isDay = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}/.test(v);

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const dayOf = (v: unknown): string | null => {
  const value = text(v);
  return isDay(value) ? value.slice(0, 10) : null;
};

export interface TrackingInput {
  shipment: ShipmentRecord;
  /** The customs status the shipment shows: it follows the paperwork, the stored one alone doesn't say. */
  customsStatus: string;
  /** The audit rows of TRACKING_AUDIT_FIELDS, newest first. */
  audit: readonly ShipmentAuditRecord[];
  /** The shipment's live events, the latest first. */
  events: readonly ShipmentTrackingEventRecord[];
  /** What the customer was told, the latest first. */
  notices: readonly ShipmentCustomerNoticeRecord[];
  mayChangeDetails: boolean;
  tasks: readonly ShipmentTaskRecord[];
  /** User names by id. */
  names: ReadonlyMap<string, string>;
  invoiced: boolean | null;
  changesCapped: boolean;
  now: Date;
}

export function buildTracking({ shipment, customsStatus, audit, events, notices, mayChangeDetails, tasks, names, invoiced, changesCapped, now }: TrackingInput): ShipmentTracking {
  const today = businessDay(now);
  const nameOf = (userId: string | null | undefined): string => (userId ? (names.get(userId) ?? "") : "");

  // Newest first, so the first row seen of a field is its last change.
  const lastChange = new Map<string, ShipmentAuditRecord>();
  for (const row of audit) if (!lastChange.has(row.field)) lastChange.set(row.field, row);

  const sourceLabel = (source: string) => SOURCE_LABELS[source as TrackingSource] ?? "";
  // A proposal hasn't happened until somebody confirms it; a dismissed one never did.
  const standing = events.filter((e) => e.effect !== "proposed" && e.effect !== "dismissed");
  const eventRecorded = (e: ShipmentTrackingEventRecord): TrackingRecorded => ({ at: e.createdAt.toISOString(), by: nameOf(e.recordedById), source: sourceLabel(e.source) });

  const recordedOf = (field: string | undefined): TrackingRecorded | null => {
    const row = field ? lastChange.get(field) : undefined;
    return row ? { at: row.changedAt.toISOString(), by: nameOf(row.userId), source: SOURCE_OF_FIELD[row.field] ?? "" } : null;
  };

  const taxDate = taxDateOfJob(shipment, recordedOf, invoiced);
  const taxKey = isDeliveryDated(shipment) ? "delivered" : shipment.tradeDirection.trim().toLowerCase() === "export" ? "departed" : "arrived";

  const label = (kind: TrackingKind) => labelOfKind(kind, shipment);
  const rows = rowsOf(shipment).map((spec): { row: TrackingMilestone; trackable: boolean } | null => {
    const customs = spec.key === CUSTOMS_KEY;
    let planned = spec.planned ? dayOf(shipment[spec.planned]) : null;
    let plannedTime = spec.plannedTime ? text(shipment[spec.plannedTime]) : "";
    const column = spec.actual ? dayOf(shipment[spec.actual]) : null;
    const ofKind = spec.event ? standing.filter((e) => e.kind === spec.event) : [];
    // The shipment's date is the truth where it has one; an event then only adds the hour and who.
    const event = spec.actual ? (ofKind.find((e) => e.occurredOn === column) ?? null) : (ofKind[0] ?? null);
    let actual = spec.actual ? column : (event?.occurredOn ?? null);
    let detail = spec.noteAsDetail ? text(event?.note) : "";
    let done = !!actual;
    let recorded = event ? eventRecorded(event) : recordedOf(actual ? spec.actual : planned ? spec.planned : undefined);
    const proposal = spec.event ? events.find((e) => e.kind === spec.event && e.effect === "proposed") : undefined;

    if (customs) {
      const status = text(customsStatus);
      const mrn = text(shipment.mrn);
      // An Urgent shipment has to be cleared by its deadline, "YYYY-MM-DD HH:mm".
      const deadline = text(shipment.customsDeadline);
      planned = dayOf(deadline);
      plannedTime = deadline.slice(11, 16);
      done = status === CUSTOMS_CLEARED;
      const change = lastChange.get("customsStatus");
      actual = !done ? null : (event?.occurredOn ?? (change?.newValue === CUSTOMS_CLEARED ? businessDay(change.changedAt) : null));
      detail = [done && actual ? "" : status, mrn && `MRN ${mrn}`].filter(Boolean).join(" · ");
      // Only a status somebody set has an author; the paperwork's own steps have none.
      recorded = done && event ? eventRecorded(event) : change?.newValue === status ? recordedOf("customsStatus") : null;
      // A job that needs no customs still reads "waiting for paperwork": that alone doesn't show the row.
      if (spec.optional && !done && !mrn && !planned) return null;
    } else if (spec.optional && !planned && !actual && !proposal) {
      return null;
    }

    const change = spec.planned ? lastChange.get(spec.planned) : undefined;
    const from = dayOf(change?.oldValue);
    const moved = from && planned && dayOf(change?.newValue) === planned && from !== planned;

    return {
      trackable: !!spec.actual || customs,
      row: {
        key: spec.key,
        label: spec.label,
        basis: spec.basis ?? "",
        leg: spec.leg,
        place: text(event?.place) || text(spec.place),
        planned,
        plannedTime,
        wasPlanned: moved ? from : null,
        movedDays: moved ? daysBetween(from, planned!) : null,
        actual,
        actualTime: done && event?.occurredAt ? businessTime(event.occurredAt) : "",
        proposed: proposal ? { eventId: proposal.id, day: proposal.effectValue ?? proposal.occurredOn, source: sourceLabel(proposal.source) } : null,
        detail,
        containerNumber: text(event?.containerNumber),
        state: done ? "done" : "open",
        lateDays: 0,
        taxDate: spec.key === taxKey,
        recorded,
      },
    };
  }).filter((r) => r !== null);

  // A transhipment can happen several times: each one is a row, after the departure, in its order.
  const transhipments = standing
    .filter((e) => TRANSHIPMENT_KINDS.has(e.kind))
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.createdAt.getTime() - b.createdAt.getTime())
    .map((e): { row: TrackingMilestone; trackable: boolean } => ({
      trackable: false,
      row: {
        key: `ts-${e.id}`,
        label: label(e.kind as TrackingKind),
        basis: "",
        leg: "main",
        place: text(e.place),
        planned: null,
        plannedTime: "",
        wasPlanned: null,
        movedDays: null,
        actual: e.occurredOn,
        actualTime: e.occurredAt ? businessTime(e.occurredAt) : "",
        proposed: null,
        detail: [e.vessel, e.voyage].filter(Boolean).join(" "),
        containerNumber: text(e.containerNumber),
        state: "done",
        lateDays: 0,
        taxDate: false,
        recorded: eventRecorded(e),
      },
    }));
  const afterDeparture = rows.findIndex(({ row }) => row.key === "departed") + 1;
  rows.splice(afterDeparture, 0, ...transhipments);

  const lastDone = rows.reduce((last, { row }, i) => (row.state === "done" ? i : last), -1);
  let nextSet = false;
  const milestones = rows.map(({ row, trackable }, i) => {
    if (row.state === "done") return row;
    if (!trackable) return { ...row, state: "planned" as const };
    // A later step already happened: an earlier date nobody noted isn't late, unless the invoice hangs on it.
    const overdue = row.planned && row.planned < today && (i > lastDone || row.taxDate);
    if (overdue) return { ...row, state: "late" as const, lateDays: daysBetween(row.planned!, today) };
    if (!nextSet && i > lastDone) {
      nextSet = true;
      return { ...row, state: "next" as const };
    }
    return row;
  });

  return {
    milestones,
    changes: audit.filter((row) => row.field in CHANGE_LABELS).map(toChange(nameOf)),
    changesCapped,
    attention: [...exceptionsOf(events, nameOf), ...notToldOf(notices, shipment, nameOf), ...attentionOf(milestones, shipment, lastChange, nameOf, today)],
    customerNotices: notices.map(toNoticeItem(nameOf)),
    events: events.filter((e) => !PLAN_CHANGE_KINDS.has(e.kind) || !!e.note.trim()).map(toEventItem(nameOf, sourceLabel, shipment)),
    recordable: recordableKinds(shipment, mayChangeDetails),
    mayChangeDetails,
    ticks: tasks
      .filter((t) => t.completed && t.completedAt)
      .map((t) => ({ taskKey: t.taskKey, completedAt: t.completedAt!.toISOString(), by: nameOf(t.completedById) })),
    taxDate,
  };
}

const toChange = (nameOf: (id: string) => string) => (row: ShipmentAuditRecord): TrackingChange => {
  const from = dayOf(row.oldValue);
  const to = dayOf(row.newValue);
  return {
    id: row.id,
    field: row.field,
    label: CHANGE_LABELS[row.field] ?? row.field,
    isDate: row.field in DATE_LABELS,
    oldValue: text(row.oldValue) || null,
    newValue: text(row.newValue) || null,
    movedDays: from && to ? daysBetween(from, to) : null,
    by: nameOf(row.userId),
    at: row.changedAt.toISOString(),
  };
};

const toEventItem = (nameOf: (id: string | null) => string, sourceLabel: (source: string) => string, shipment: ShipmentRecord) => (e: ShipmentTrackingEventRecord): TrackingEventItem => ({
  id: e.id,
  kind: e.kind,
  label: isTrackingKind(e.kind) ? labelOfKind(e.kind, shipment) : e.kind,
  occurredOn: e.occurredOn,
  occurredTime: e.occurredAt ? businessTime(e.occurredAt) : "",
  place: e.place,
  vessel: [e.vessel, e.voyage].filter(Boolean).join(" "),
  containerNumber: e.containerNumber,
  note: e.note,
  source: sourceLabel(e.source),
  by: nameOf(e.recordedById),
  recordedAt: e.createdAt.toISOString(),
  effect: e.effect as TrackingEventItem["effect"],
  effectValue: e.effectValue,
  sets: setsWord(e.effectField),
  strikeable: e.source === "user" || e.source === "document",
  resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
});

const toNoticeItem = (nameOf: (id: string | null) => string) => (n: ShipmentCustomerNoticeRecord): TrackingCustomerNotice => ({
  id: n.id,
  kind: n.kind,
  label: isNoticeKind(n.kind) ? NOTICE_KINDS[n.kind] : n.kind,
  channel: n.channel,
  toldTo: n.toldTo,
  subject: n.subject,
  note: n.note,
  etaPod: n.etaPod,
  etaWarehouse: n.etaWarehouse,
  plannedDelivery: n.plannedDelivery,
  by: nameOf(n.toldById),
  at: n.createdAt.toISOString(),
});

/** The dates the customer was told last, where they have moved since. */
const notToldOf = (notices: readonly ShipmentCustomerNoticeRecord[], shipment: ShipmentRecord, nameOf: (id: string | null) => string): TrackingAttention[] => {
  const latest = notices[0];
  if (!latest) return [];
  return toldDifferences(latest, shipment).map((d) => ({
    kind: "not_told",
    eventId: null,
    note: "",
    milestoneKey: d.field,
    what: d.what,
    days: 0,
    from: d.told,
    to: d.now,
    at: latest.createdAt.toISOString(),
    by: nameOf(latest.toldById),
  }));
};

/** The exceptions people reported and nobody closed, the latest first. */
const exceptionsOf = (events: readonly ShipmentTrackingEventRecord[], nameOf: (id: string | null) => string): TrackingAttention[] =>
  events
    .filter((e) => isExceptionKind(e.kind) && !e.resolvedAt)
    .map((e) => ({
      kind: "exception",
      eventId: e.id,
      note: e.note,
      milestoneKey: e.kind,
      what: isTrackingKind(e.kind) ? TRACKING_KINDS[e.kind].label : e.kind,
      days: 0,
      from: null,
      to: e.occurredOn,
      at: e.createdAt.toISOString(),
      by: nameOf(e.recordedById),
    }));

const PLANNED_FIELD_OF: Record<string, Field> = {
  departed: "estimatedDeparture",
  arrived: "estimatedArrival",
  gateIn: "etaWarehouse",
  delivered: "plannedDeliveryDate",
};

function attentionOf(
  milestones: readonly TrackingMilestone[],
  shipment: ShipmentRecord,
  lastChange: ReadonlyMap<string, ShipmentAuditRecord>,
  nameOf: (id: string) => string,
  today: string,
): TrackingAttention[] {
  const isExport = shipment.tradeDirection.trim().toLowerCase() === "export";
  const movedSince = addDays(today, -DATE_MOVED_WINDOW_DAYS);
  const out: TrackingAttention[] = [];
  for (const m of milestones) {
    if (m.state === "done") continue;
    const lateAfter = m.key === "arrived" ? ARRIVAL_LATE_AFTER_DAYS : m.key === "departed" && isExport ? EXPORT_DEPARTURE_LATE_AFTER_DAYS : null;
    if (lateAfter !== null && m.lateDays >= lateAfter) {
      out.push({ kind: "late", eventId: null, note: "", milestoneKey: m.key, what: m.key === "arrived" ? "ETA" : "ETD", days: m.lateDays, from: null, to: m.planned, at: null, by: "" });
    }
    const field = PLANNED_FIELD_OF[m.key];
    const change = field ? lastChange.get(field) : undefined;
    if (field && change && m.movedDays && businessDay(change.changedAt) >= movedSince) {
      out.push({
        kind: "moved",
        eventId: null,
        note: "",
        milestoneKey: m.key,
        what: CHANGE_LABELS[field]!,
        days: m.movedDays,
        from: m.wasPlanned,
        to: m.planned,
        at: change.changedAt.toISOString(),
        by: nameOf(change.userId),
      });
    }
  }
  return out;
}

function taxDateOfJob(s: ShipmentRecord, recordedOf: (field: string) => TrackingRecorded | null, invoiced: boolean | null): TrackingTaxDate {
  const choose = (
    actual: { basis: TrackingTaxDate["basis"]; field: Field },
    estimate: { basis: TrackingTaxDate["basis"]; field: Field },
  ): TrackingTaxDate => {
    const firm = dayOf(s[actual.field]);
    if (firm) return { basis: actual.basis, date: firm, actual: true, recorded: recordedOf(actual.field), invoiced };
    const provisional = dayOf(s[estimate.field]);
    if (provisional) return { basis: estimate.basis, date: provisional, actual: false, recorded: recordedOf(estimate.field), invoiced };
    return { basis: "none", date: null, actual: false, recorded: null, invoiced };
  };
  if (isDeliveryDated(s)) return choose({ basis: "delivery", field: "actualDeliveryDate" }, { basis: "plannedDelivery", field: "plannedDeliveryDate" });
  if (s.tradeDirection.trim().toLowerCase() === "export") return choose({ basis: "atd", field: "actualDeparture" }, { basis: "etd", field: "estimatedDeparture" });
  return choose({ basis: "ata", field: "actualArrival" }, { basis: "eta", field: "estimatedArrival" });
}
