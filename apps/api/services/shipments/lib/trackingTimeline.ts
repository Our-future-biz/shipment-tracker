// The Tracking tab's read model: what the shipment's dates, its audit log and its ticks say about
// where the cargo is. Nothing is stored here. Pure, so it is unit-tested.
//
// The rows are dated facts, never checklist ticks: a tick's time is the click (D1). A row with an
// actual date is done; a row whose planned date passed with nothing recorded is late. A tick moves
// no row.

import { addDays, businessDay } from "../../../lib/businessDate";
import { isDeliveryDated } from "../../../lib/deliveryDated";
import type {
  ShipmentTracking,
  TrackingAttention,
  TrackingChange,
  TrackingLeg,
  TrackingMilestone,
  TrackingRecorded,
  TrackingTaxDate,
} from "../interfaces/interfaces";
import type { ShipmentRecord } from "../schemas/shipment.schema";
import type { ShipmentAuditRecord } from "../schemas/shipmentAudit.schema";
import type { ShipmentTaskRecord } from "../schemas/shipmentTask.schema";
import { ARRIVAL_LATE_AFTER_DAYS, DATE_MOVED_WINDOW_DAYS, EXPORT_DEPARTURE_LATE_AFTER_DAYS } from "./trackingThresholds";

type Field = keyof ShipmentRecord & string;

export const CUSTOMS_CLEARED = "Customs Cleared/Released";

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
  /** Shown only when it holds something. */
  optional?: boolean;
}

const CUSTOMS_KEY = "customs";

function rowsOf(s: ShipmentRecord): RowSpec[] {
  const direction = s.tradeDirection.trim().toLowerCase();
  const isExport = direction === "export";
  const road = direction === "domestic" || /road/i.test(s.freightMode);

  const cargoReady: RowSpec = { key: "cargoReady", label: "Cargo ready", leg: "origin", planned: "cargoReadinessDate", optional: true };
  const pickup: RowSpec = { key: "pickup", label: "Picked up", leg: "origin", planned: "pickupDate", plannedTime: "pickupTime", optional: !road };
  const equipment: RowSpec = {
    key: "equipment",
    label: "Equipment delivery / pick-up",
    leg: isExport ? "origin" : "destination",
    planned: "equipmentDeliveryDate",
    plannedTime: "equipmentDeliveryTime",
    optional: true,
  };
  const departed: RowSpec = { key: "departed", label: "Departed", basis: "ETD / ATD", leg: "main", place: s.pol, planned: "estimatedDeparture", actual: "actualDeparture", optional: road };
  const arrived: RowSpec = { key: "arrived", label: "Arrived", basis: "ETA / ATA", leg: "main", place: s.pod, planned: "estimatedArrival", actual: "actualArrival", optional: road };
  const customs: RowSpec = { key: CUSTOMS_KEY, label: "Customs cleared", leg: isExport ? "origin" : "destination", optional: road };
  const gateIn: RowSpec = { key: "gateIn", label: "Gate in", basis: "ETA warehouse", leg: isExport ? "origin" : "destination", place: s.hub, planned: "etaWarehouse", actual: "warehouseReceivedDate", optional: true };
  const gateOut: RowSpec = { key: "gateOut", label: "Gate out", leg: isExport ? "origin" : "destination", place: s.hub, actual: "warehouseReleasedDate", optional: true };
  const delivered: RowSpec = {
    key: "delivered",
    label: "Delivered",
    leg: "destination",
    place: s.destination,
    planned: "plannedDeliveryDate",
    plannedTime: "plannedDeliveryTime",
    actual: "actualDeliveryDate",
    optional: isExport,
  };

  if (isExport) {
    const closings: RowSpec[] = [
      { key: "closing", label: "Cargo closing", leg: "origin", planned: "closingDate", plannedTime: "closingTime", optional: true },
      { key: "vgmClosing", label: "VGM closing", leg: "origin", planned: "vgmClosing", plannedTime: "vgmClosingTime", optional: true },
      { key: "siClosing", label: "SI closing", leg: "origin", planned: "siClosing", plannedTime: "siClosingTime", optional: true },
    ];
    return [cargoReady, pickup, equipment, gateIn, gateOut, customs, ...closings, departed, arrived, delivered];
  }
  return [cargoReady, pickup, departed, arrived, customs, equipment, gateIn, gateOut, delivered];
}

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
  tasks: readonly ShipmentTaskRecord[];
  /** User names by id. */
  names: ReadonlyMap<string, string>;
  invoiced: boolean | null;
  changesCapped: boolean;
  now: Date;
}

export function buildTracking({ shipment, customsStatus, audit, tasks, names, invoiced, changesCapped, now }: TrackingInput): ShipmentTracking {
  const today = businessDay(now);
  const nameOf = (userId: string | null | undefined) => (userId ? (names.get(userId) ?? "") : "");

  // Newest first, so the first row seen of a field is its last change.
  const lastChange = new Map<string, ShipmentAuditRecord>();
  for (const row of audit) if (!lastChange.has(row.field)) lastChange.set(row.field, row);

  const recordedOf = (field: string | undefined): TrackingRecorded | null => {
    const row = field ? lastChange.get(field) : undefined;
    return row ? { at: row.changedAt.toISOString(), by: nameOf(row.userId), source: SOURCE_OF_FIELD[row.field] ?? "" } : null;
  };

  const taxDate = taxDateOfJob(shipment, recordedOf, invoiced);
  const taxKey = isDeliveryDated(shipment) ? "delivered" : shipment.tradeDirection.trim().toLowerCase() === "export" ? "departed" : "arrived";

  const rows = rowsOf(shipment).map((spec): { row: TrackingMilestone; trackable: boolean } | null => {
    const customs = spec.key === CUSTOMS_KEY;
    let planned = spec.planned ? dayOf(shipment[spec.planned]) : null;
    let plannedTime = spec.plannedTime ? text(shipment[spec.plannedTime]) : "";
    let actual = spec.actual ? dayOf(shipment[spec.actual]) : null;
    let detail = "";
    let done = !!actual;
    let recorded = recordedOf(actual ? spec.actual : planned ? spec.planned : undefined);

    if (customs) {
      const status = text(customsStatus);
      const mrn = text(shipment.mrn);
      // An Urgent shipment has to be cleared by its deadline, "YYYY-MM-DD HH:mm".
      const deadline = text(shipment.customsDeadline);
      planned = dayOf(deadline);
      plannedTime = deadline.slice(11, 16);
      done = status === CUSTOMS_CLEARED;
      const change = lastChange.get("customsStatus");
      actual = done && change?.newValue === CUSTOMS_CLEARED ? businessDay(change.changedAt) : null;
      detail = [done && actual ? "" : status, mrn && `MRN ${mrn}`].filter(Boolean).join(" · ");
      // Only a status somebody set has an author; the paperwork's own steps have none.
      recorded = change?.newValue === status ? recordedOf("customsStatus") : null;
      // A job that needs no customs still reads "waiting for paperwork": that alone doesn't show the row.
      if (spec.optional && !done && !mrn && !planned) return null;
    } else if (spec.optional && !planned && !actual) {
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
        place: text(spec.place),
        planned,
        plannedTime,
        wasPlanned: moved ? from : null,
        movedDays: moved ? daysBetween(from, planned!) : null,
        actual,
        detail,
        state: done ? "done" : "open",
        lateDays: 0,
        taxDate: spec.key === taxKey,
        recorded,
      },
    };
  }).filter((r) => r !== null);

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
    attention: attentionOf(milestones, shipment, lastChange, nameOf, today),
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
      out.push({ kind: "late", milestoneKey: m.key, what: m.key === "arrived" ? "ETA" : "ETD", days: m.lateDays, from: null, to: m.planned, at: null, by: "" });
    }
    const field = PLANNED_FIELD_OF[m.key];
    const change = field ? lastChange.get(field) : undefined;
    if (field && change && m.movedDays && businessDay(change.changedAt) >= movedSince) {
      out.push({
        kind: "moved",
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
