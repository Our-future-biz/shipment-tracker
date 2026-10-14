import type { interfaces } from "@/lib/api/client";
import { pragueDate } from "../../_lib/worklist";

// The gate job's History tab: every logged event of the movement, by kind of event. Pure helpers
// (tested in history.test.ts).

export type HistoryCategory = "stamps" | "voids" | "release" | "exceptions" | "cargo" | "shipment" | "records";

export const HISTORY_CATEGORIES: { id: HistoryCategory; label: string }[] = [
  { id: "stamps", label: "Stamps" },
  { id: "voids", label: "Voids" },
  { id: "release", label: "Release & PIN" },
  { id: "exceptions", label: "Exceptions" },
  { id: "cargo", label: "Container & re-weigh" },
  { id: "shipment", label: "Shipment updates" },
  { id: "records", label: "Record & details" },
];

/** The gate stamps; a manager may void the current one from History. */
export const STAMP_KINDS = ["gateIn", "gateOut", "impRelease", "expDraft", "expReceipt"] as const;
export type StampEventKind = (typeof STAMP_KINDS)[number];
export const isStampKind = (kind: string): kind is StampEventKind => (STAMP_KINDS as readonly string[]).includes(kind);

const BY_KIND: Record<string, HistoryCategory> = {
  gateIn: "stamps",
  gateOut: "stamps",
  impRelease: "stamps",
  expDraft: "stamps",
  expReceipt: "stamps",
  walkIn: "stamps",
  stampVoided: "voids",
  releaseGate: "release",
  releaseRequested: "release",
  override: "release",
  refused: "release",
  pinLocked: "release",
  pinCheckFailed: "release",
  pickupPinLine: "release",
  releaseStatusCleared: "release",
  exceptionOpened: "exceptions",
  exceptionResolved: "exceptions",
  // One container, many positions: the stuffing plan, the stripping tally and the re-weigh.
  reweighed: "cargo",
  addedToContainer: "cargo",
  removedFromContainer: "cargo",
  stuffed: "cargo",
  unstuffed: "cargo",
  leftInContainer: "cargo",
  leftInContainerVoided: "voids",
  notLoaded: "cargo",
  tallyReceived: "cargo",
  tallyShort: "cargo",
  tallyNotArrived: "cargo",
  tallyVoided: "voids",
  shipmentUpdated: "shipment",
  shipmentUpdateFailed: "shipment",
  shipmentUpdateRetry: "shipment",
  shipmentUpdateDismissed: "shipment",
  shipmentUpdateCancelled: "shipment",
  shipmentMayNeedCorrecting: "shipment",
  customsFromShipment: "shipment",
  refreshedFromShipment: "shipment",
};

/** The category of an event kind; unknown kinds are record events. */
export function categoryOf(kind: string): HistoryCategory {
  if (BY_KIND[kind]) return BY_KIND[kind]!;
  if (/^pickupPin|^pin/i.test(kind)) return "release";
  if (/^shipmentUpdate/.test(kind)) return "shipment";
  return "records";
}

export type HistoryEvent = interfaces.GateEvent & { category: HistoryCategory; index: number };
export type HistoryDay = { day: string; events: HistoryEvent[] };

/**
 * The events newest first, grouped by Prague day, keeping only the chosen categories (all when
 * none are chosen). Events with the same time keep their logged order reversed (latest first).
 */
export function historyDays(events: interfaces.GateEvent[], only: HistoryCategory[] = []): HistoryDay[] {
  const list = events
    .map((e, index): HistoryEvent => ({ ...e, category: categoryOf(e.kind), index }))
    .filter((e) => !only.length || only.includes(e.category))
    .sort((a, b) => {
      const ta = Date.parse(a.at) || 0;
      const tb = Date.parse(b.at) || 0;
      return tb - ta || b.index - a.index;
    });
  const days: HistoryDay[] = [];
  for (const e of list) {
    const day = pragueDate(e.at) || "Unknown date";
    const last = days[days.length - 1];
    if (last && last.day === day) last.events.push(e);
    else days.push({ day, events: [e] });
  }
  return days;
}

/** Count of events per category (for the filter chips). */
export function categoryCounts(events: interfaces.GateEvent[]): Record<HistoryCategory, number> {
  const out = Object.fromEntries(HISTORY_CATEGORIES.map((c) => [c.id, 0])) as Record<HistoryCategory, number>;
  for (const e of events) out[categoryOf(e.kind)] += 1;
  return out;
}

/**
 * The stamp of this event is still the one on the record (not voided or stamped again since), so
 * a manager may void it from History.
 */
export function isCurrentStamp(m: Pick<interfaces.GateMovementItem, StampEventKind>, e: Pick<interfaces.GateEvent, "kind" | "at">): boolean {
  if (!isStampKind(e.kind)) return false;
  const at = m[e.kind];
  return !!at && Date.parse(at) === Date.parse(e.at);
}
