import type { GateEvent } from "../schemas/gateMovement.schema";
import type { GateMovementItem } from "../interfaces/gate.interfaces";
import type { WarehouseContainerItem, ShipmentUpdateHealth, StorageSummary } from "../interfaces/records.interfaces";
import type { CockpitAudit, CockpitDelivery, CockpitList, CockpitRow, CockpitTag, CockpitTiles, WarehouseManagersCockpit } from "../interfaces/cockpit.interfaces";
import { CUSTOMS_CLEARED } from "./customs";
import { isDomestic } from "./direction";
import { DEFAULT_FREE_DAYS, dayNo, pragueDate } from "./storage";
import { customsClock, customsRegime, type CustomsClockInfo } from "./warehouseStockCustoms";
import { isTripSource } from "./tripSource";
import { FLOOR_WRITE_LOST_EVENT } from "./correction";
import {
  ARRIVED_NOT_RECEIVED_ATTENTION_HOURS,
  ARRIVED_NOT_RECEIVED_URGENT_HOURS,
  AUDIT_DAYS,
  CLOSED_NO_GATE_OUT_HOURS,
  CUSTOMS_READ_STALE_HOURS,
  DETENTION_URGENT_DAYS,
  FLOOR_WRITE_LOST_DAYS,
  STUFFING_ATTENTION_DAYS,
  STUFFING_URGENT_DAYS,
  MRN_REQUEST_HOURS,
  RELEASE_BLOCKED_HOURS,
  RELEASED_CHARGEABLE_DAYS,
  TRIP_LATE_HOURS,
  COCKPIT_LIST_LIMIT,
  CUSTOMS_ATTENTION_DAYS,
  CUSTOMS_URGENT_DAYS,
  ON_HOLD_ATTENTION_HOURS,
  ON_HOLD_URGENT_HOURS,
  READY_FREE_DAYS_LEFT,
  STRIPPING_OPEN_HOURS,
} from "./cockpitThresholds";

// The managers' cockpit, worked out from the gate records and containers as the server returns
// them (Council Outlay 5, steps 1 to 3). Pure: no database, tested in tests/managersCockpit.test.ts.
//
//   tiles     the Positions quick filters, counted over every position on the server (the same
//             rules as the web's _lib/worklist.ts, which the tiles open)
//   cards     a record appears once: in URGENT when any of its signals is urgent, else in
//             ATTENTION, with all its signals as tags; most urgent first
//   audit     overrides, voids, refusals, archives with stamps and deleted shipments of the
//             last AUDIT_DAYS days, from the records' history
// Today is the Prague day of `now` on the server, never the browser's.

type Item = GateMovementItem;
type Container = WarehouseContainerItem;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const nf = (n: number) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");

const PRAGUE_STAMP = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "23.10. 09:12" (Prague) of an ISO time; "" for none. */
export function stampText(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(PRAGUE_STAMP.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}. ${p.hour}:${p.minute}`;
}
/** "25.10.2026" of a YYYY-MM-DD day. */
export const dayText = (d: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d);

const hoursSince = (iso: string | null | undefined, now: Date) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : (now.getTime() - t) / HOUR;
};
const lastEvent = (m: Pick<Item, "events">, kind: string, match: (e: GateEvent) => boolean = () => true) =>
  [...(m.events ?? [])].reverse().find((e) => e.kind === kind && match(e));

// ─── The Positions quick-filter rules (server copies of _lib/worklist.ts) ──────────

// A stored date or date-time as a Prague day: a plain YYYY-MM-DD stays, a time is converted.
function dayOf(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(t)) {
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(t)) return t.slice(0, 10);
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? "" : pragueDate(d);
  }
  return "";
}

const liveSlot = (s: Item["dockSlots"][number]) => s.status !== "Cancelled" && s.status !== "Completed";

/** Expected at the gate today: not arrived, and today is its dock slot, ETA, slot text, trip arrival or an ETW. */
export function isExpectedToday(m: Item, today: string): boolean {
  if (m.status !== "Expected" || m.gateIn) return false;
  if (m.dockSlots.some((s) => liveSlot(s) && s.date === today)) return true;
  if (dayOf(m.eta) === today || dayOf(m.slot) === today) return true;
  const inLeg = (m.transportLegs ?? []).find((l) => l.leg === "IN");
  if (inLeg && isTripSource(inLeg.source) && dayOf(inLeg.gateTime) === today) return true;
  return m.subPositions.some((s) => dayOf(s.etw) === today);
}

const goneOut = (m: Item) => m.visit === "výdej" && !!m.gateOut;
/** The storage clock runs: received and not yet released or gone out. */
export const inWarehouse = (m: Item) => (m.storage.started && !m.storage.stopped) || (m.status === "In Warehouse" && !goneOut(m) && !m.impRelease);
/** An open exception holds the cargo until it leaves, unless a supervisor overrode. */
export const isOnHold = (m: Item) => m.openExceptions > 0 && !m.impRelease && !m.leftAt && !m.overridden;
export const needsAttentionChip = (m: Item) => m.needsAttention || m.openExceptions > 0 || m.shipmentUpdate?.state === "failed";

/** The 90-day customs counter of a record, from its receipt to its leaving (or today). */
export function recordCustomsClock(m: Item, today: string): CustomsClockInfo {
  const steps = m.lifecycle?.steps ?? [];
  const received = steps.find((s) => s.stage === "received");
  const left = steps.find((s) => s.stage === "left");
  const day = (at: string | null) => (at ? dayOf(at) || null : null);
  return customsClock({
    regime: customsRegime({ customsMode: m.customsMode, customsStatus: m.customsStatus, operationType: m.operationType }),
    start: received?.done ? day(received.at) : null,
    stop: left?.done ? day(left.at) : null,
    today,
  });
}
const customsDue = (c: CustomsClockInfo) => c.state === "warning" || c.state === "overdue";

// ─── Signals ───────────────────────────────────────────────────

// Lower rank = higher in its card. State blockers first, then the clocks by time left, then the rest.
interface Signal extends CockpitTag {
  rank: number;
}
const urgent = (text: string, rank: number): Signal => ({ text, urgent: true, rank });
const attention = (text: string, rank: number): Signal => ({ text, urgent: false, rank });
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const notOkGates = (m: Item) => m.releaseGates.filter((g) => g.s !== "OK" && !/empty return/i.test(g.g));
const outLegEmpty = (m: Item) => {
  const leg = (m.transportLegs ?? []).find((l) => l.leg === "OUT");
  return !leg || (!leg.company.trim() && !leg.plate.trim() && !leg.gateTime.trim());
};

const hoursText = (h: number) => `${Math.floor(h)} h`;
const daysAgo = (iso: string | null | undefined, now: Date) => {
  const h = hoursSince(iso, now);
  return h === null ? null : h / 24;
};

/**
 * Expected and not arrived although its time passed: an IN dock slot that ended, a Trucking trip
 * more than TRIP_LATE_HOURS past its gate time, or an ETA warehouse (ETW) / slot day before today.
 * The ETA is not used: it is the vessel's arrival copied from the shipment, not the warehouse's.
 */
export function notArrivedReason(m: Item, today: string, now: Date): string | null {
  if (m.status !== "Expected" || m.gateIn) return null;
  const slot = m.dockSlots
    .filter((s) => s.direction === "IN" && (s.status === "Booked" || s.status === "In progress" || s.status === "Overdue") && s.endsAt && Date.parse(s.endsAt) < now.getTime())
    .sort((a, b) => (a.endsAt ?? "").localeCompare(b.endsAt ?? ""))[0];
  if (slot) return `Not arrived: dock slot ${slot.dock} ${dayText(slot.date).slice(0, 6)} ${slot.time}${slot.end ? `–${slot.end}` : ""} passed`;
  const leg = (m.transportLegs ?? []).find((l) => l.leg === "IN");
  if (leg && isTripSource(leg.source)) {
    const late = hoursSince(leg.gateTime, now);
    if (late !== null && late >= TRIP_LATE_HOURS) return `Not arrived: trip ${leg.source.tripRef} due ${stampText(leg.gateTime)}`;
  }
  const passed = [dayOf(m.slot), ...m.subPositions.map((s) => dayOf(s.etw))].filter((d) => d && d < today).sort()[0];
  return passed ? `Not arrived: expected ${dayText(passed)}` : null;
}

function customsSignal(c: CustomsClockInfo): Signal | null {
  if (!customsDue(c) || c.daysLeft === null) return null;
  const d = c.daysLeft;
  const when = d < 0 ? `${plural(-d, "day")} overdue` : d === 0 ? "deadline today" : `${plural(d, "day")} left`;
  const text = `Customs deadline: ${when} (${dayText(c.deadline)})`;
  if (d <= CUSTOMS_URGENT_DAYS) return urgent(text, 100 + clamp(d, -99, 99));
  return d <= CUSTOMS_ATTENTION_DAYS ? attention(text, 100 + d) : null;
}

/** What a record's neighbours know about it. */
export interface RecordContext {
  /** The events for Trucking it failed to send for good ("gate-in"). */
  truckingNotSent?: string[];
  /** Its bonded entry was discharged when it left, with no MRN or customs document: the regime. */
  leftWithoutDocument?: string;
}

/** Every signal of one gate record, in no particular order. */
export function recordSignals(m: Item, today: string, now: Date, ctx: RecordContext = {}): Signal[] {
  const out: Signal[] = [];
  const open = !m.impRelease && !m.leftAt;
  const running = m.storage.started && !m.storage.stopped;

  // State blockers: they have no countdown, they are "now".
  if (m.status === "Refused" && !m.impRelease) {
    const e = lastEvent(m, "refused");
    const why = (e?.detail ?? "").trim();
    out.push(urgent(`Refused${e ? ` ${stampText(e.at)}` : ""}${why ? `: ${why.length > 80 ? `${why.slice(0, 79)}…` : why}` : ""}`, 0));
  }
  if (m.pinLocked && !m.impRelease && !m.gateOut) {
    const e = lastEvent(m, "pinLocked");
    out.push(urgent(`Pick-up PIN: locked${e ? ` ${stampText(e.at)}` : ""}`, 1));
  }
  if (m.shipmentUpdate?.state === "failed") {
    const what = m.shipmentUpdate.what.filter(Boolean).join(", ");
    out.push(urgent(`Not sent: ${what || "shipment update"}`, 2));
  }
  if (ctx.truckingNotSent?.length) out.push(urgent(`Not sent to Trucking: ${[...new Set(ctx.truckingNotSent)].join(", ")}`, 2));
  if (m.overridden && open) {
    // An override arms the release whatever the gates say; it matters while it lets something pass.
    const passes = notOkGates(m).map((g) => `${g.g} ${g.s}`);
    if (m.openExceptions > 0) passes.push(plural(m.openExceptions, "open exception"));
    if (passes.length) out.push(urgent(`Override in force: ${passes.join(", ")}`, 3));
  }

  // Time passed: something was due and did not happen.
  const notArrived = notArrivedReason(m, today, now);
  if (notArrived) out.push(urgent(notArrived, 50));
  const requested = lastEvent(m, "releaseRequested");
  if (requested && !m.armed && !m.impRelease) {
    const h = hoursSince(requested.at, now);
    if (h !== null && h >= RELEASE_BLOCKED_HOURS) {
      const waiting = notOkGates(m).map((g) => g.g);
      out.push(urgent(`Release requested ${stampText(requested.at)}: blocked ${hoursText(h)}${waiting.length ? ` · ${waiting.join(", ")}` : ""}`, 60));
    }
  }
  if (m.visit !== "výdej" && !isDomestic(m.handling) && m.gateIn && !m.expReceipt && m.status !== "Refused") {
    const h = hoursSince(m.gateIn, now);
    if (h !== null && h >= ARRIVED_NOT_RECEIVED_ATTENTION_HOURS) {
      const reweigh = m.needsReweigh && !m.reweigh ? " · waiting for re-weigh" : "";
      const text = `Arrived ${stampText(m.gateIn)}, not received (${hoursText(h)})${reweigh}`;
      out.push(h >= ARRIVED_NOT_RECEIVED_URGENT_HOURS ? urgent(text, 70) : attention(text, 350));
    }
  }

  // Clocks.
  if (open) {
    const c = customsSignal(recordCustomsClock(m, today));
    if (c) out.push(c);
  }
  if (isOnHold(m)) {
    const opened = m.exceptions.filter((e) => e.status === "open").map((e) => e.createdAt).sort()[0];
    const hours = hoursSince(opened, now);
    if (hours !== null && hours >= ON_HOLD_ATTENTION_HOURS) {
      const text = `On hold (${m.openExceptions}) since ${stampText(opened)}`;
      const rank = 300 - clamp(Math.floor(hours), 0, 199);
      out.push(hours >= ON_HOLD_URGENT_HOURS ? urgent(text, rank) : attention(text, rank));
    }
  }

  // Attention: things that become a problem if nobody acts.
  if (m.lifecycle?.stage === "ready" && running && m.storage.freeDaysLeft <= READY_FREE_DAYS_LEFT && outLegEmpty(m) && !m.dockSlots.some((s) => s.direction === "OUT" && liveSlot(s))) {
    const left = m.storage.freeDaysLeft > 0 ? plural(m.storage.freeDaysLeft, "free day") + " left" : "free time over";
    out.push(attention(`Ready for release, no pick-up booked · ${left}`, 400));
  }
  const underCustoms = m.visit === "výdej" && !isDomestic(m.handling) && m.customsStatus !== CUSTOMS_CLEARED;
  if (underCustoms && !m.impRelease && !m.gateOut && (!m.mrn.trim() || m.mrn.trim() === "—")) {
    const asked = lastEvent(m, "mrnRequested");
    const waited = asked ? hoursSince(asked.at, now) : null;
    const answer = waited !== null && waited >= MRN_REQUEST_HOURS ? `, no answer for ${hoursText(waited)}` : "";
    out.push(attention(`MRN missing${asked ? ` · requested ${stampText(asked.at)}${answer}` : ""}`, 410));
  }
  if (m.shipmentId && open && m.releaseGates.some((g) => g.g === "Customs" && g.s !== "OK") && !m.events.some((e) => e.kind === "shipmentDeleted")) {
    const h = hoursSince(m.shipmentCheckedAt, now);
    if (h === null) out.push(attention("Customs status not read from the shipment", 420));
    else if (h >= CUSTOMS_READ_STALE_HOURS) out.push(attention(`Customs status last read from the shipment ${stampText(m.shipmentCheckedAt)}`, 420));
  }
  // Storage charged on outbound cargo whose "Storage settled" line was never ticked by a person
  // (it is born OK for LCL and Domestic cargo): while it is here, and for a few days after it left.
  if ((m.visit === "výdej" || isDomestic(m.handling)) && m.storage.chargeableDays > 0) {
    const settled = m.releaseGates.find((g) => g.g === "Storage settled");
    const ticked = (m.events ?? []).some((e) => e.kind === "releaseGate" && e.label.startsWith("Storage settled:"));
    const czk = `est. CZK ${nf(m.storage.estimatedCzk)}`;
    if (settled?.s === "OK" && !ticked) {
      if (!m.impRelease && running) out.push(attention(`Storage chargeable (${czk}), "Storage settled" OK by default`, 430));
      else if (m.impRelease) {
        const d = daysAgo(m.impRelease, now);
        if (d !== null && d <= RELEASED_CHARGEABLE_DAYS) out.push(attention(`Released ${stampText(m.impRelease)} with storage chargeable (${czk}), "Storage settled" never ticked`, 430));
      }
    }
  }
  if (running && m.freeDays !== null && m.freeDays > DEFAULT_FREE_DAYS) {
    const e = lastEvent(m, "storageClockChanged", (x) => x.label.startsWith("Free days:"));
    out.push(attention(`Free days: ${m.freeDays} (default ${DEFAULT_FREE_DAYS})${e?.by ? ` · set by ${e.by}` : ""}`, 440));
  }

  // Trucking: a trip planned for today that got no dock door (outside the dock hours, or every
  // dock booked) — the trip only wrote it to the log.
  for (const leg of m.transportLegs ?? []) {
    if (!isTripSource(leg.source) || dayOf(leg.gateTime) !== today) continue;
    if (leg.leg === "IN" ? !!m.gateIn : leg.leg === "OUT" ? !!(m.gateOut || m.impRelease) : true) continue;
    const ref = leg.source.tripRef;
    if (!m.dockSlots.some((s) => liveSlot(s) && s.tripRef === ref)) out.push(attention(`Trip ${ref} today ${stampText(leg.gateTime).slice(-5)}, no dock slot`, 450));
  }

  // History that needs a hand.
  if (m.events.some((e) => e.kind === "shipmentDeleted")) out.push(attention("Shipment deleted in Shipments, position kept — archive it with a reason", 460));
  if (m.correctionNeeded) {
    out.push(attention(`Shipment may need correcting (${stampText(m.correctionNeeded.at)}): a stamp was voided after it reached Shipments — dismiss it on the gate job once corrected`, 470));
  }
  const lost = (m.events ?? []).filter((e) => e.kind === FLOOR_WRITE_LOST_EVENT && (daysAgo(e.at, now) ?? Infinity) <= FLOOR_WRITE_LOST_DAYS);
  if (lost.length) {
    const what = lost.map((e) => e.label.replace(/^Floor mode: /, "").replace(/ — discarded on the phone, not sent$/, ""));
    out.push(attention(`Floor mode discarded ${plural(lost.length, "write")} on the phone: ${what.join(", ")}`, 480));
  }
  if (ctx.leftWithoutDocument) {
    out.push(attention(`Left under customs control (${ctx.leftWithoutDocument === "Transit T1" ? "T1 transit" : "temporary storage"}) with no MRN or customs document — attach it in the Bonded Register`, 490));
  }
  return out;
}

/** Every signal of one container (houses are listed on their own records). */
export function containerSignals(c: Container, now: Date, today = pragueDate(now)): Signal[] {
  const out: Signal[] = [];
  if (c.gateOutAt) return out;
  // Detention: the carrier's free time for the box on our yard (a typed date, Dock & Yard).
  const expiry = dayOf(c.detentionExpiry);
  if (expiry && c.gatedIn && !c.gatedOut) {
    const d = dayNo(expiry) - dayNo(today);
    if (d <= DETENTION_URGENT_DAYS) {
      const when = d < 0 ? `expired ${plural(-d, "day")} ago` : d === 0 ? "expires today" : `expires in ${plural(d, "day")}`;
      out.push(urgent(`Detention ${when} (${dayText(expiry)}) — book the empty return`, 80 + clamp(d, -9, 9)));
    }
  }
  // Export stuffing against the earliest closing date of its houses (the shipment's cargo
  // cut-off); without one, their ETD.
  if (c.kind === "export" && (c.status === "Planning" || c.status === "Stuffing")) {
    const houses = c.positions.filter((p) => !p.archived && !p.stuffedAt);
    const closing = houses.map((p) => dayOf(p.closingDate)).filter(Boolean).sort()[0];
    const etd = houses.map((p) => dayOf(p.etd)).filter(Boolean).sort()[0];
    const due = closing || etd;
    if (due && houses.length) {
      const d = dayNo(due) - dayNo(today);
      const what = closing ? "closing" : "ETD";
      const when = d < 0 ? `${plural(-d, "day")} past the ${what}` : d === 0 ? `${what} today` : `${what} in ${plural(d, "day")}`;
      const text = `Stuffing: ${plural(houses.length, "house")} not stuffed · ${when} (${dayText(due)})`;
      if (d <= STUFFING_URGENT_DAYS) out.push(urgent(text, 90 + clamp(d, -9, 9)));
      else if (d <= STUFFING_ATTENTION_DAYS) out.push(attention(text, 495 + d));
    }
  }
  if (c.kind === "import" && c.gateInAt && (c.status === "Arrived" || c.status === "Stripping")) {
    const hours = hoursSince(c.gateInAt, now);
    if (hours !== null && hours >= STRIPPING_OPEN_HOURS) {
      const open = c.positions.filter((p) => !p.archived && !p.tallyOutcome).length;
      out.push(attention(`Stripping open since ${stampText(c.gateInAt)} · ${plural(open, "house")} not ticked`, 500));
    }
  }
  if (c.kind === "export" && c.status === "Closed" && c.closedAt) {
    const hours = hoursSince(c.closedAt, now);
    if (hours !== null && hours >= CLOSED_NO_GATE_OUT_HOURS) out.push(attention(`Closed ${stampText(c.closedAt)}, no gate-out`, 510));
  }
  if (c.kind === "export" && (c.status === "Planning" || c.status === "Stuffing") && c.totals.overCapacity) {
    const t = c.totals;
    const over = [(t.fillCbmPct ?? 0) > 100 ? `${Math.round(t.fillCbmPct!)} % cbm` : "", (t.fillKgPct ?? 0) > 100 ? `${Math.round(t.fillKgPct!)} % kg` : ""].filter(Boolean);
    out.push(attention(`Over capacity: ${over.join(" · ")}`, 520));
  }
  return out;
}

// ─── Rows and cards ────────────────────────────────────────────

const directionText = (m: Pick<Item, "visit" | "handling">) => (isDomestic(m.handling) ? "Domestic (in → out)" : m.visit === "výdej" ? "Outbound" : "Inbound");

function freeTimeText(s: Item["storage"]): string {
  if (!s.started) return "";
  if (s.stopped) return "Stopped";
  if (s.state === "Chargeable") return `Chargeable ${plural(s.chargeableDays, "day")} · est. CZK ${nf(s.estimatedCzk)}`;
  if (s.state === "Expiring") return `Expiring · ${plural(s.freeDaysLeft, "free day")} left`;
  return `${plural(s.freeDaysLeft, "free day")} left`;
}

interface Ranked {
  row: CockpitRow;
  urgent: boolean;
  rank: number;
}

function rank(row: Omit<CockpitRow, "tags">, signals: Signal[]): Ranked | null {
  if (!signals.length) return null;
  const isUrgent = signals.some((s) => s.urgent);
  const ordered = [...signals].sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.rank - b.rank);
  const lead = ordered.filter((s) => s.urgent === isUrgent);
  return { row: { ...row, tags: ordered.map(({ text, urgent: u }) => ({ text, urgent: u })) }, urgent: isUrgent, rank: Math.min(...lead.map((s) => s.rank)) };
}

const positionRow = (m: Item): Omit<CockpitRow, "tags"> => ({
  kind: "position",
  id: m.id,
  ref: m.positionRef || m.gateRef,
  sub: m.jobNumber,
  customer: m.customer,
  direction: directionText(m),
  visit: m.visit,
  lifecycle: m.lifecycle ? `${m.lifecycle.label}${m.lifecycle.refused ? " · Refused" : ""}` : "",
  freeTime: freeTimeText(m.storage),
});

const containerRow = (c: Container): Omit<CockpitRow, "tags"> => ({
  kind: "container",
  id: c.id,
  ref: c.number || "(no number)",
  sub: [c.equipment, c.status].filter(Boolean).join(" · "),
  customer: c.customer,
  direction: c.kind === "export" ? "Export container" : "Import container",
  visit: "",
  lifecycle: c.status,
  freeTime: "",
});

const card = (ranked: Ranked[]): CockpitList => {
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank || a.row.ref.localeCompare(b.row.ref));
  return { total: sorted.length, rows: sorted.slice(0, COCKPIT_LIST_LIMIT).map((r) => r.row) };
};

// ─── Audit ─────────────────────────────────────────────────────

export interface AuditRecord {
  events: GateEvent[];
}
export interface ArchivedRecord {
  /** ISO time it was archived; null for records deleted before archiving existed. */
  archivedAt: string | null;
  /** It had a gate stamp (only a manager archives such a record, with a reason). */
  stamped: boolean;
}

export function buildAudit(records: AuditRecord[], archived: ArchivedRecord[], now: Date): CockpitAudit {
  const since = now.getTime() - AUDIT_DAYS * DAY;
  const recent = (at: string | null | undefined) => {
    const t = at ? Date.parse(at) : NaN;
    return !Number.isNaN(t) && t >= since && t <= now.getTime();
  };
  let overrides = 0;
  let overridesPastCustoms = 0;
  let refusals = 0;
  let shipmentsDeleted = 0;
  let voids = 0;
  for (const r of records) {
    const events = (r.events ?? []).filter((e) => recent(e.at));
    overrides += events.filter((e) => e.kind === "override").length;
    overridesPastCustoms += events.filter((e) => e.kind === "override" && (e.gates ?? []).some((g) => g.g === "Customs" && g.s !== "OK")).length;
    refusals += events.filter((e) => e.kind === "refused").length;
    shipmentsDeleted += events.filter((e) => e.kind === "shipmentDeleted").length;
    // One void can clear later stamps too (one event each, same moment): count the action once.
    voids += new Set(events.filter((e) => e.kind === "stampVoided").map((e) => `${e.at}|${e.by}`)).size;
  }
  const archivedWithStamps = archived.filter((a) => a.stamped && recent(a.archivedAt)).length;
  return { days: AUDIT_DAYS, overrides, overridesPastCustoms, voids, refusals, archivedWithStamps, shipmentsDeleted };
}

// ─── The cockpit ───────────────────────────────────────────────

export interface CockpitInput {
  /** Live gate records that still matter (open, or owing a shipment update), as the Gate Log returns them. */
  items: Item[];
  /** Containers not gone out yet. */
  containers: Container[];
  /** Every live record's history, for the audit line. */
  history: AuditRecord[];
  archived: ArchivedRecord[];
  shipmentUpdates: ShipmentUpdateHealth;
  storage: StorageSummary;
  /** Gate record id → the events for Trucking it failed to send for good ("gate-in", "gate-out"). */
  truckingNotSent?: Map<string, string[]>;
  /** Gate record id → the customs regime it left under with no MRN or customs document. */
  leftWithoutDocument?: Map<string, string>;
  delivery?: CockpitDelivery;
  now: Date;
}

const NO_DELIVERY: CockpitDelivery = { shipmentUpdatesWaiting: 0, truckingFailed: 0, truckingWaiting: 0, staleMinutes: 0, supplierEmailsFailed: 0, supplierEmailDays: 0 };

export function buildCockpit(input: CockpitInput): WarehouseManagersCockpit {
  const { now } = input;
  const today = pragueDate(now);

  // Tiles: positions only (records with a warehouse position), as the Positions chips count them.
  const positions = input.items.filter((m) => !!m.warehouseTaskId);
  const chargeable = positions.filter((m) => inWarehouse(m) && m.storage.chargeableDays > 0);
  const tiles: CockpitTiles = {
    inWarehouse: positions.filter(inWarehouse).length,
    expectedToday: positions.filter((m) => isExpectedToday(m, today)).length,
    needsAttention: positions.filter(needsAttentionChip).length,
    onHold: positions.filter(isOnHold).length,
    customsDeadline: positions.filter((m) => !!m.lifecycle && customsDue(recordCustomsClock(m, today))).length,
    chargeable: chargeable.length,
    chargeableCzk: chargeable.reduce((a, m) => a + m.storage.estimatedCzk, 0),
  };

  const ranked = [
    ...input.items.map((m) => rank(positionRow(m), recordSignals(m, today, now, { truckingNotSent: input.truckingNotSent?.get(m.id), leftWithoutDocument: input.leftWithoutDocument?.get(m.id) }))),
    ...input.containers.map((c) => rank(containerRow(c), containerSignals(c, now, today))),
  ].filter((r): r is Ranked => r !== null);

  return {
    asOf: now.toISOString(),
    today,
    tiles,
    urgent: card(ranked.filter((r) => r.urgent)),
    attention: card(ranked.filter((r) => !r.urgent)),
    shipmentUpdates: input.shipmentUpdates,
    storage: input.storage,
    delivery: input.delivery ?? NO_DELIVERY,
    audit: buildAudit(input.history, input.archived, now),
  };
}
