import type { GateEvent } from "../schemas/gateMovement.schema";
import type { GateMovementItem } from "../interfaces/gate.interfaces";
import type { WarehouseContainerItem, ShipmentUpdateHealth, StorageSummary } from "../interfaces/records.interfaces";
import type { CockpitAudit, CockpitList, CockpitRow, CockpitTag, CockpitTiles, WarehouseManagersCockpit } from "../interfaces/cockpit.interfaces";
import { CUSTOMS_CLEARED } from "./customs";
import { isDomestic } from "./direction";
import { DEFAULT_FREE_DAYS, pragueDate } from "./storage";
import { customsClock, customsRegime, type CustomsClockInfo } from "./warehouseStockCustoms";
import { isTripSource } from "./tripSource";
import {
  AUDIT_DAYS,
  CLOSED_NO_GATE_OUT_HOURS,
  COCKPIT_LIST_LIMIT,
  CUSTOMS_ATTENTION_DAYS,
  CUSTOMS_URGENT_DAYS,
  ON_HOLD_ATTENTION_HOURS,
  ON_HOLD_URGENT_HOURS,
  READY_FREE_DAYS_LEFT,
  STRIPPING_OPEN_HOURS,
} from "./cockpitThresholds";

// The managers' cockpit, worked out from the gate records and containers as the server returns
// them (Council Outlay 5, step 1). Pure: no database, tested in tests/managersCockpit.test.ts.
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

function customsSignal(c: CustomsClockInfo): Signal | null {
  if (!customsDue(c) || c.daysLeft === null) return null;
  const d = c.daysLeft;
  const when = d < 0 ? `${plural(-d, "day")} overdue` : d === 0 ? "deadline today" : `${plural(d, "day")} left`;
  const text = `Customs deadline: ${when} (${dayText(c.deadline)})`;
  if (d <= CUSTOMS_URGENT_DAYS) return urgent(text, 100 + clamp(d, -99, 99));
  return d <= CUSTOMS_ATTENTION_DAYS ? attention(text, 100 + d) : null;
}

/** Every signal of one gate record, in no particular order. */
export function recordSignals(m: Item, today: string, now: Date): Signal[] {
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
  if (m.overridden && open) {
    // An override arms the release whatever the gates say; it matters while it lets something pass.
    const passes = notOkGates(m).map((g) => `${g.g} ${g.s}`);
    if (m.openExceptions > 0) passes.push(plural(m.openExceptions, "open exception"));
    if (passes.length) out.push(urgent(`Override in force: ${passes.join(", ")}`, 3));
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
    out.push(attention(`MRN missing${asked ? ` · requested ${stampText(asked.at)}` : ""}`, 410));
  }
  if (m.shipmentId && open && !m.shipmentCheckedAt && m.releaseGates.some((g) => g.g === "Customs" && g.s !== "OK")) {
    out.push(attention("Customs status not read from the shipment", 420));
  }
  if ((m.visit === "výdej" || isDomestic(m.handling)) && !m.impRelease && running && m.storage.state === "Chargeable") {
    const settled = m.releaseGates.find((g) => g.g === "Storage settled");
    const ticked = (m.events ?? []).some((e) => e.kind === "releaseGate" && e.label.startsWith("Storage settled:"));
    if (settled?.s === "OK" && !ticked) out.push(attention(`Storage chargeable (est. CZK ${nf(m.storage.estimatedCzk)}), "Storage settled" OK by default`, 430));
  }
  if (running && m.freeDays !== null && m.freeDays > DEFAULT_FREE_DAYS) {
    const e = lastEvent(m, "storageClockChanged", (x) => x.label.startsWith("Free days:"));
    out.push(attention(`Free days: ${m.freeDays} (default ${DEFAULT_FREE_DAYS})${e?.by ? ` · set by ${e.by}` : ""}`, 440));
  }
  return out;
}

/** Every signal of one container (houses are listed on their own records). */
export function containerSignals(c: Container, now: Date): Signal[] {
  const out: Signal[] = [];
  if (c.gateOutAt) return out;
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
  let refusals = 0;
  let shipmentsDeleted = 0;
  let voids = 0;
  for (const r of records) {
    const events = (r.events ?? []).filter((e) => recent(e.at));
    overrides += events.filter((e) => e.kind === "override").length;
    refusals += events.filter((e) => e.kind === "refused").length;
    shipmentsDeleted += events.filter((e) => e.kind === "shipmentDeleted").length;
    // One void can clear later stamps too (one event each, same moment): count the action once.
    voids += new Set(events.filter((e) => e.kind === "stampVoided").map((e) => `${e.at}|${e.by}`)).size;
  }
  const archivedWithStamps = archived.filter((a) => a.stamped && recent(a.archivedAt)).length;
  return { days: AUDIT_DAYS, overrides, voids, refusals, archivedWithStamps, shipmentsDeleted };
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
  now: Date;
}

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
    ...input.items.map((m) => rank(positionRow(m), recordSignals(m, today, now))),
    ...input.containers.map((c) => rank(containerRow(c), containerSignals(c, now))),
  ].filter((r): r is Ranked => r !== null);

  return {
    asOf: now.toISOString(),
    today,
    tiles,
    urgent: card(ranked.filter((r) => r.urgent)),
    attention: card(ranked.filter((r) => !r.urgent)),
    shipmentUpdates: input.shipmentUpdates,
    storage: input.storage,
    audit: buildAudit(input.history, input.archived, now),
  };
}
