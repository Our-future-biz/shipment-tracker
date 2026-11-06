// What the bell says about a shipment's dates (Council Outlay 8, D10): a planned date that moved,
// a date a source proposes, and what the customer was told that no longer holds. Pure, so it is
// unit-tested. One line per shipment per day, however often the date was saved that day.

import { businessDay } from "../../../lib/businessDate";
import type { TrackingBellNotice } from "../interfaces/interfaces";
import { TRACKING_KINDS, isTrackingKind, SOURCE_LABELS, type TrackingSource } from "./trackingEvents";
import { toldDifferences, type ToldDifference } from "./customerNotice";
import { SALES_TOLD_FROM_DAYS } from "./trackingThresholds";

/** The planned dates a move of which is news. */
export const BELL_DATE_FIELDS = ["estimatedDeparture", "estimatedArrival", "etaWarehouse", "plannedDeliveryDate"] as const;

const LABEL: Record<string, string> = {
  estimatedDeparture: "ETD",
  estimatedArrival: "ETA",
  etaWarehouse: "ETA warehouse",
  plannedDeliveryDate: "Delivery",
};

const czDay = (day: string | null) => (day ? `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}` : "no date");
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}/.test(v);

export interface DateMovedRow {
  id: string;
  shipmentId: string;
  jobNumber: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
  userId: string;
  /** The reader is this shipment's Person in Charge or Holiday Cover, rather than only its sales person. */
  ownShipment: boolean;
  readAt: Date | null;
}

/** The moves worth a line, newest first. The sales person hears only of a big move, or once the customer was told a date. */
export function datesMovedNotices(rows: readonly DateMovedRow[], names: ReadonlyMap<string, string>, toldShipments: ReadonlySet<string>): TrackingBellNotice[] {
  const seen = new Set<string>();
  const out: TrackingBellNotice[] = [];
  for (const row of rows) {
    if (!isDay(row.oldValue) || !isDay(row.newValue) || row.oldValue.slice(0, 10) === row.newValue.slice(0, 10)) continue;
    const days = daysBetween(row.oldValue.slice(0, 10), row.newValue.slice(0, 10));
    if (!row.ownShipment && !toldShipments.has(row.shipmentId) && Math.abs(days) < SALES_TOLD_FROM_DAYS) continue;
    const once = `${row.shipmentId}:${businessDay(row.changedAt)}`;
    if (seen.has(once)) continue;
    seen.add(once);
    out.push({
      key: `moved:${once}`,
      kind: "date_moved",
      shipmentId: row.shipmentId,
      jobNumber: row.jobNumber,
      title: `${LABEL[row.field] ?? row.field} moved`,
      text: `${czDay(row.oldValue)} → ${czDay(row.newValue)}`,
      by: names.get(row.userId) ?? "",
      at: row.changedAt.toISOString(),
      unread: !row.readAt || row.changedAt > row.readAt,
    });
  }
  return out;
}

export interface ProposedRow {
  id: string;
  shipmentId: string;
  jobNumber: string;
  kind: string;
  source: string;
  effectField: string;
  effectValue: string | null;
  occurredOn: string;
  createdAt: Date;
  readAt: Date | null;
}

const WORD_OF_FIELD: Record<string, string> = { actualDeparture: "ATD", actualArrival: "ATA", actualDeliveryDate: "Delivery date" };

/** A date a source reports, waiting for a person: stays until it is confirmed or dismissed. */
export const proposedNotices = (rows: readonly ProposedRow[]): TrackingBellNotice[] =>
  rows.map((row) => ({
    key: `proposed:${row.id}`,
    kind: "to_confirm",
    shipmentId: row.shipmentId,
    jobNumber: row.jobNumber,
    title: `${WORD_OF_FIELD[row.effectField] ?? "Date"} to confirm`,
    text: `${isTrackingKind(row.kind) ? TRACKING_KINDS[row.kind].label : row.kind} ${czDay(row.effectValue ?? row.occurredOn)}`,
    by: SOURCE_LABELS[row.source as TrackingSource] ?? "",
    at: row.createdAt.toISOString(),
    unread: !row.readAt || row.createdAt > row.readAt,
  }));

export interface ToldRow {
  shipmentId: string;
  jobNumber: string;
  noticeAt: Date;
  readAt: Date | null;
  /** The dates told. */
  etaPod: string | null;
  etaWarehouse: string | null;
  plannedDelivery: string | null;
  /** The dates as they stand. */
  estimatedArrival: string | null;
  actualArrival: string | null;
  etaWarehouseNow: string | null;
  warehouseReceivedDate: string | null;
  plannedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
}

const describeDifference = (d: ToldDifference) => `${d.what}: told ${czDay(d.told)}, now ${czDay(d.now)}`;

/** The customer was told a date that has moved since. Stays until they are told again. */
export function notToldNotices(rows: readonly ToldRow[], lastChange: ReadonlyMap<string, Date>): TrackingBellNotice[] {
  return rows.flatMap((row) => {
    const differences = toldDifferences(row, { ...row, etaWarehouse: row.etaWarehouseNow });
    if (differences.length === 0) return [];
    // When the dates moved: without the log's word, the notice itself is the only time known.
    const at = differences.reduce<Date>((latest, d) => {
      const moved = lastChange.get(`${row.shipmentId}:${d.field}`);
      return moved && moved > latest ? moved : latest;
    }, row.noticeAt);
    return [{
      key: `not_told:${row.shipmentId}`,
      kind: "not_told" as const,
      shipmentId: row.shipmentId,
      jobNumber: row.jobNumber,
      title: "Customer not told",
      text: differences.map(describeDifference).join(" · "),
      by: "",
      at: at.toISOString(),
      unread: !row.readAt || at > row.readAt,
    }];
  });
}
