import { EQUIPMENT_CAPACITY_CBM } from "./containerRules";
import { DEFAULT_DOCKS } from "./settingsRules";
import { pragueInstant } from "./dockSlots";
import { reweighVariance, REWEIGH_TOLERANCE } from "./reweigh";
import { addDays, dayNo, isIsoDate, movementStorage, pragueDate, type StorageMovement } from "./storage";
import { leftOf, receiptOf, type StampPoint } from "./kpiStamps";
import type { KpiDockSettings, KpiThroughputBucket, WarehouseKpi, WarehouseKpiPart, WarehouseKpiReport } from "../interfaces/kpi.interfaces";
import type { LaneFill, MonthlySummary, ShipmentUpdateHealth, TopCustomer } from "../interfaces/records.interfaces";

// The Reports KPIs, from the stamps: every KPI says where it starts and stops, which records it
// counts and how many. When nothing can be measured the value is null with the reason. Pure
// (exported for tests); the service loads the rows. All days are Prague days.

const DAY = 86_400_000;
const HOUR = 3_600_000;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Default docks and opening hours (one constant with Warehouse settings; used when none are saved). */
export const DEFAULT_DOCK_SETTINGS: KpiDockSettings = DEFAULT_DOCKS;

/** Periods longer than this are refused. */
export const KPI_MAX_DAYS = 366;
/** Up to this many days the throughput is per day, else per ISO week. */
export const KPI_DAILY_MAX_DAYS = 31;

// ---------- inputs (the fields the calculation reads) ----------

export interface KpiMovement extends StorageMovement {
  id: string;
  customer: string;
  colli: number;
  loadType: string;
  operationType: string;
  expReceipt: Date | null;
  receivedAt: Date | null;
  leftAt: Date | null;
}

export interface KpiContainer {
  id: string;
  direction: string;
  equipment: string;
  cbm: number | null;
  pieces: number | null;
  dischargePort: string;
  /** Typed yard dates (YYYY-MM-DD), used when the container has no stamp. */
  gatedIn: string;
  gatedOut: string;
  gateInAt: Date | null;
  gateOutAt: Date | null;
}

export interface KpiHouse {
  movementId: string;
  containerId: string;
  addedBy: string;
  stuffedAt: Date | null;
  tickedAt: Date | null;
}

export interface KpiSlot {
  movementId: string | null;
  dock: string;
  direction: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface KpiReweigh {
  movementId: string;
  weighedKg: number;
  declaredKg: number | null;
  weighedAt: Date;
}

export interface KpiException {
  movementId: string;
  type: string;
  pieces: number;
  createdAt: Date;
}

export interface KpiInput {
  movements: KpiMovement[];
  containers: KpiContainer[];
  houses: KpiHouse[];
  slots: KpiSlot[];
  reweighs: KpiReweigh[];
  exceptions: KpiException[];
  shipmentUpdates: ShipmentUpdateHealth;
  docks?: KpiDockSettings;
}

export interface KpiPeriod {
  from: string;
  to: string;
}

// ---------- small helpers ----------

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + (f(r) || 0), 0);

/** Nearest-rank percentile of sorted values. */
function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const median = s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : null;
  return { n: s.length, median, p90: percentile(s, 90), avg: s.length ? sum(s, (x) => x) / s.length : null };
}

const part = (label: string, value: number | null, unit: string, n: number, d = 1): WarehouseKpiPart => ({ label, value: value == null ? null : round(value, d), unit, n });

/** Days between two points: exact when both are stamps, else calendar days (a typed date is a day only). */
function daysBetween(a: StampPoint, b: StampPoint) {
  if (a.at && b.at) return Math.max(0, (b.at.getTime() - a.at.getTime()) / DAY);
  return Math.max(0, dayNo(b.day) - dayNo(a.day));
}

/** ISO weekday of a YYYY-MM-DD (1 = Monday … 7 = Sunday). */
const isoWeekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() || 7;

function isoWeek(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = d.getUTCDay() || 7;
  const monday = new Date(d.getTime() - (wd - 1) * DAY);
  const thursday = new Date(d.getTime() + (4 - wd) * DAY);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return { week: Math.ceil(((thursday.getTime() - yearStart) / DAY + 1) / 7), monday: monday.toISOString().slice(0, 10) };
}

const hm = (s: string) => (HM.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);

/** Days from `from` to `to`, both included. */
export function periodDays(p: KpiPeriod) {
  return dayNo(p.to) - dayNo(p.from) + 1;
}

/**
 * The period asked for, checked: from/to are Prague days (YYYY-MM-DD), both included; missing
 * means the last 7 days to today. Returns an error text when it cannot be used.
 */
export function resolvePeriod(from: string | undefined, to: string | undefined, now = new Date()): KpiPeriod | { error: string } {
  const today = pragueDate(now);
  const t = to?.trim() || today;
  const f = from?.trim() || addDays(t, -6);
  if (!isIsoDate(f) || !isIsoDate(t)) return { error: "The period needs dates as YYYY-MM-DD" };
  if (f > t) return { error: "The period starts after it ends" };
  if (periodDays({ from: f, to: t }) > KPI_MAX_DAYS) return { error: `The period can be at most ${KPI_MAX_DAYS} days` };
  return { from: f, to: t };
}

// ---------- the report ----------

export function buildKpiReport(input: KpiInput, period: KpiPeriod, now = new Date()): WarehouseKpiReport {
  const docks = input.docks ?? DEFAULT_DOCK_SETTINGS;
  const inPeriod = (day: string | null | undefined) => !!day && day >= period.from && day <= period.to;
  const containers = new Map(input.containers.map((c) => [c.id, c]));
  const houseOf = new Map(input.houses.map((h) => [h.movementId, h]));

  const rows = input.movements.map((m) => {
    const h = houseOf.get(m.id);
    const c = h ? containers.get(h.containerId) : undefined;
    const receipt = receiptOf(m, h && c ? { addedBy: h.addedBy, containerDirection: c.direction } : null);
    return { m, house: h, container: c, receipt, left: leftOf(m) };
  });
  const receivedIn = rows.filter((r) => r.receipt && inPeriod(r.receipt.day));
  const leftIn = rows.filter((r) => r.left && inPeriod(r.left.day));
  const days = periodDays(period);

  const kpis: WarehouseKpi[] = [
    dwellKpi(leftIn),
    gateToReceiptKpi(receivedIn),
    receiptToReleaseKpi(rows.filter((r) => r.receipt && r.m.impRelease && inPeriod(pragueDate(r.m.impRelease)))),
    throughputKpi(receivedIn, leftIn, days),
    dockUtilisationKpi(input.slots, docks, period),
    onTimeKpi(rows, input.slots, inPeriod),
    reweighKpi(input.reweighs, inPeriod),
    exceptionKpi(input.exceptions, receivedIn.length, inPeriod),
    outboxKpi(input.shipmentUpdates, now),
  ];

  return {
    period: { ...period, days, bucket: days <= KPI_DAILY_MAX_DAYS ? "day" : "week" },
    generatedAt: now.toISOString(),
    kpis,
    throughput: throughputBuckets(receivedIn, leftIn, period),
    topCustomers: topCustomers(receivedIn.map((r) => r.m)),
    monthly: monthlySummary(rows, input.containers, now),
    lanes: laneFill(input.containers, input.houses, input.movements, inPeriod),
    storage: storageNow(input.movements, now),
    shipmentUpdates: input.shipmentUpdates,
    docks,
  };
}

type Row = { m: KpiMovement; house?: KpiHouse; container?: KpiContainer; receipt: StampPoint | null; left: StampPoint | null };
const isInbound = (r: Row) => r.m.visit !== "výdej";

function dwellKpi(leftIn: Row[]): WarehouseKpi {
  const measured = leftIn.filter((r) => r.receipt);
  const all = stats(measured.map((r) => daysBetween(r.receipt!, r.left!)));
  const inb = stats(measured.filter(isInbound).map((r) => daysBetween(r.receipt!, r.left!)));
  const outb = stats(measured.filter((r) => !isInbound(r)).map((r) => daysBetween(r.receipt!, r.left!)));
  const dayOnly = measured.filter((r) => !r.receipt!.at).length;
  const noReceipt = leftIn.length - measured.length;
  return {
    key: "dwell",
    label: "Dwell time",
    value: all.median == null ? null : round(all.median),
    unit: "days",
    n: all.n,
    measured:
      "Median days from the receipt (inbound: WH receipt; outbound: stripping tally tick, or the typed received date) to leaving (WH release, or the gate-out of the export container it was stuffed in). Counts positions that left in the period. Not the storage clock: free time of inbound cargo starts at its gate-in, so Positions and Stock may show an earlier start date.",
    notMeasured: [
      all.n ? "" : "No position with a receipt left in this period",
      noReceipt ? `${noReceipt} left without a receipt stamp (not counted)` : "",
      dayOnly ? `${dayOnly} with a typed received date (counted in whole days)` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    breakdown: [
      part("P90", all.p90, "days", all.n),
      part("Average", all.avg, "days", all.n),
      part("Inbound (median)", inb.median, "days", inb.n),
      part("Outbound (median)", outb.median, "days", outb.n),
    ],
  };
}

function gateToReceiptKpi(receivedIn: Row[]): WarehouseKpi {
  // Inbound: truck gate-in → WH receipt. Outbound: its import container's gate-in → tally tick.
  const inbound = receivedIn
    .filter((r) => isInbound(r) && r.m.gateIn && r.m.expReceipt)
    .map((r) => (r.m.expReceipt!.getTime() - r.m.gateIn!.getTime()) / HOUR)
    .filter((h) => h >= 0);
  const outbound = receivedIn
    .filter((r) => !isInbound(r) && r.m.receivedAt && r.container?.gateInAt)
    .map((r) => (r.m.receivedAt!.getTime() - r.container!.gateInAt!.getTime()) / HOUR)
    .filter((h) => h >= 0);
  const all = stats([...inbound, ...outbound]);
  const i = stats(inbound);
  const o = stats(outbound);
  const missing = receivedIn.length - all.n;
  return {
    key: "gateToReceipt",
    label: "Gate-to-receipt time",
    value: all.median == null ? null : round(all.median),
    unit: "hours",
    n: all.n,
    measured:
      "Median hours from arrival to receipt. Inbound: truck gate-in → WH receipt. Outbound: gate-in of its import container → ticked received at the stripping tally. Counts positions received in the period.",
    notMeasured: [
      all.n ? "" : "No receipt in this period has both stamps",
      missing > 0 && all.n ? `${missing} received without an arrival stamp (or by a typed date) are not counted` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    breakdown: [part("P90", all.p90, "hours", all.n), part("Inbound (median)", i.median, "hours", i.n), part("Outbound (median)", o.median, "hours", o.n)],
  };
}

function receiptToReleaseKpi(released: Row[]): WarehouseKpi {
  const s = stats(released.map((r) => daysBetween(r.receipt!, { at: r.m.impRelease!, day: pragueDate(r.m.impRelease!), source: "WH release" })));
  return {
    key: "receiptToRelease",
    label: "Receipt-to-release time",
    value: s.median == null ? null : round(s.median),
    unit: "days",
    n: s.n,
    measured:
      "Median days from the receipt to the WH release stamp. Only positions released at the WH release in the period (cargo that left stuffed in a container is in Dwell time).",
    notMeasured: s.n ? "" : "No WH release of a received position in this period",
    breakdown: [part("P90", s.p90, "days", s.n), part("Average", s.avg, "days", s.n)],
  };
}

function throughputKpi(receivedIn: Row[], leftIn: Row[], days: number): WarehouseKpi {
  const pieces = (rs: Row[]) => sum(rs, (r) => r.m.colli);
  const kg = (rs: Row[]) => sum(rs, (r) => r.m.weightKg);
  const cbm = (rs: Row[]) => sum(rs, (r) => r.m.measureCbm);
  return {
    key: "throughput",
    label: "Throughput in / out",
    value: receivedIn.length,
    unit: "positions in",
    n: receivedIn.length + leftIn.length,
    measured:
      "In = positions received in the period (at the receipt, as in Dwell time); out = positions that left in the period. Pieces, weight and volume are the gate figures of the position.",
    notMeasured: "",
    breakdown: [
      part("Positions out", leftIn.length, "positions", leftIn.length, 0),
      part("Pieces in", pieces(receivedIn), "pcs", receivedIn.length, 0),
      part("Pieces out", pieces(leftIn), "pcs", leftIn.length, 0),
      part("Weight in", kg(receivedIn), "kg", receivedIn.length, 0),
      part("Weight out", kg(leftIn), "kg", leftIn.length, 0),
      part("Volume in", cbm(receivedIn), "cbm", receivedIn.length),
      part("Volume out", cbm(leftIn), "cbm", leftIn.length),
      part("Positions in per day", receivedIn.length / days, "positions", receivedIn.length),
    ],
  };
}

function dockUtilisationKpi(slots: KpiSlot[], docks: KpiDockSettings, period: KpiPeriod): WarehouseKpi {
  const base = {
    key: "dockUtilisation",
    label: "Dock utilisation",
    unit: "%",
    measured: `Booked dock-slot minutes (not cancelled), counted only inside opening hours, ÷ (${docks.docks.length} docks × ${docks.opensAt}–${docks.closesAt} × working days in the period).`,
  };
  const open = hm(docks.opensAt);
  const close = hm(docks.closesAt);
  if (open == null || close == null || close <= open || !docks.docks.length) {
    return { ...base, value: null, n: 0, notMeasured: "Docks or opening hours are not set", breakdown: [] };
  }
  const periodStart = pragueInstant(period.from, "00:00").getTime();
  const periodEnd = pragueInstant(addDays(period.to, 1), "00:00").getTime();
  const live = slots.filter((s) => s.status !== "Cancelled" && s.startsAt && s.endsAt && s.endsAt.getTime() > periodStart && s.startsAt.getTime() < periodEnd);
  const counted = live.filter((s) => docks.docks.includes(s.dock));
  const perDock = new Map(docks.docks.map((d) => [d, 0]));
  let workingDays = 0;
  for (let day = period.from; day <= period.to; day = addDays(day, 1)) {
    if (!docks.workingDays.includes(isoWeekday(day))) continue;
    workingDays += 1;
    const ws = pragueInstant(day, docks.opensAt).getTime();
    const we = pragueInstant(day, docks.closesAt).getTime();
    for (const s of counted) {
      const overlap = Math.min(s.endsAt!.getTime(), we) - Math.max(s.startsAt!.getTime(), ws);
      if (overlap > 0) perDock.set(s.dock, (perDock.get(s.dock) ?? 0) + overlap / 60_000);
    }
  }
  const dayMinutes = close - open;
  const other = live.length - counted.length;
  if (!workingDays) return { ...base, value: null, n: counted.length, notMeasured: "No working days in this period", breakdown: [] };
  const available = docks.docks.length * dayMinutes * workingDays;
  const booked = [...perDock.values()].reduce((a, b) => a + b, 0);
  return {
    ...base,
    value: round((booked / available) * 100),
    n: counted.length,
    notMeasured: [counted.length ? "" : "No dock slots booked in this period (0 %)", other ? `${other} slot(s) on docks not in the list are not counted` : ""].filter(Boolean).join(" · "),
    breakdown: [
      part("Booked minutes", booked, "min", counted.length, 0),
      part("Available minutes", available, "min", workingDays, 0),
      ...docks.docks.map((d) => part(d, ((perDock.get(d) ?? 0) / (dayMinutes * workingDays)) * 100, "%", counted.filter((s) => s.dock === d).length)),
    ],
  };
}

function onTimeKpi(rows: Row[], slots: KpiSlot[], inPeriod: (day: string) => boolean): WarehouseKpi {
  // Inbound: the truck's gate-in against its IN slot. Outbound: the WH release against its OUT slot.
  const byMovement = new Map<string, KpiSlot[]>();
  for (const s of slots) {
    if (!s.movementId || s.status === "Cancelled" || !s.startsAt || !s.endsAt) continue;
    byMovement.set(s.movementId, [...(byMovement.get(s.movementId) ?? []), s]);
  }
  let onTime = 0;
  let late = 0;
  let noSlot = 0;
  const parts = { IN: { on: 0, n: 0 }, OUT: { on: 0, n: 0 } };
  for (const r of rows) {
    const dir = isInbound(r) ? "IN" : "OUT";
    const event = dir === "IN" ? r.m.gateIn : r.m.impRelease;
    if (!event || !inPeriod(pragueDate(event))) continue;
    const mine = (byMovement.get(r.m.id) ?? []).filter((s) => s.direction === dir).sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime());
    if (!mine.length) {
      noSlot += 1;
      continue;
    }
    // The last slot that started before the event; arriving before every slot is early (on time).
    const slot = [...mine].reverse().find((s) => s.startsAt!.getTime() <= event.getTime()) ?? mine[0]!;
    const ok = event.getTime() <= slot.endsAt!.getTime();
    if (ok) onTime += 1;
    else late += 1;
    parts[dir].n += 1;
    if (ok) parts[dir].on += 1;
  }
  const n = onTime + late;
  const pct = (on: number, of: number) => (of ? (on / of) * 100 : null);
  return {
    key: "onTime",
    label: "On time vs dock slot",
    value: n ? round(pct(onTime, n)!) : null,
    unit: "%",
    n,
    measured:
      "Inbound: truck gate-in no later than the end of its booked IN slot. Outbound: WH release no later than the end of its OUT slot. Early counts as on time. Vessel ETA is not used (it does not measure the warehouse).",
    notMeasured: [n ? "" : "No arrival or release in this period had a dock slot", noSlot ? `${noSlot} without a dock slot are not counted` : ""].filter(Boolean).join(" · "),
    breakdown: [part("Late", late, "positions", n, 0), part("Inbound on time", pct(parts.IN.on, parts.IN.n), "%", parts.IN.n), part("Outbound on time", pct(parts.OUT.on, parts.OUT.n), "%", parts.OUT.n), part("Without a slot", noSlot, "positions", noSlot, 0)],
  };
}

function reweighKpi(reweighs: KpiReweigh[], inPeriod: (day: string) => boolean): WarehouseKpi {
  // The latest re-weighing of each position counts (corrections are new rows).
  const latest = new Map<string, KpiReweigh>();
  for (const r of reweighs) {
    const prev = latest.get(r.movementId);
    if (!prev || r.weighedAt.getTime() > prev.weighedAt.getTime()) latest.set(r.movementId, r);
  }
  const inP = [...latest.values()].filter((r) => inPeriod(pragueDate(r.weighedAt)));
  const withDeclared = inP.filter((r) => r.declaredKg && r.declaredKg > 0);
  const flagged = withDeclared.filter((r) => reweighVariance(r.weighedKg, r.declaredKg).flagged).length;
  const n = withDeclared.length;
  return {
    key: "reweighVariance",
    label: "Re-weigh variance rate",
    value: n ? round((flagged / n) * 100) : null,
    unit: "%",
    n,
    measured: `Share of positions whose latest re-weigh in the period is more than ${Math.round(REWEIGH_TOLERANCE * 100)} % off the declared gross weight (either way).`,
    notMeasured: [n ? "" : "No re-weigh with a declared weight in this period", inP.length - n ? `${inP.length - n} weighed without a declared weight are not counted` : ""].filter(Boolean).join(" · "),
    breakdown: [part("Over tolerance", flagged, "positions", n, 0), part("Weighed", inP.length, "positions", inP.length, 0)],
  };
}

const EXCEPTION_TYPES = ["Damaged", "Short", "Over"] as const;

function exceptionKpi(exceptions: KpiException[], received: number, inPeriod: (day: string) => boolean): WarehouseKpi {
  const inP = exceptions.filter((e) => inPeriod(pragueDate(e.createdAt)));
  const per100 = (k: number) => (received ? (k / received) * 100 : null);
  return {
    key: "exceptionRate",
    label: "Exception rate",
    value: received ? round(per100(inP.length)!) : null,
    unit: "per 100 positions",
    n: inP.length,
    measured: "Damage / short / over exceptions recorded in the period, per 100 positions received in the period (an exception may belong to cargo received earlier).",
    notMeasured: received ? "" : `No position received in this period${inP.length ? ` (${inP.length} exception(s) recorded)` : ""}`,
    breakdown: EXCEPTION_TYPES.flatMap((t) => {
      const of = inP.filter((e) => e.type === t);
      return [part(t, per100(of.length), "per 100", of.length), part(`${t} pieces`, sum(of, (e) => e.pieces), "pcs", of.length, 0)];
    }),
  };
}

function outboxKpi(h: ShipmentUpdateHealth, now: Date): WarehouseKpi {
  const ageHours = h.oldestPendingAt ? Math.max(0, (now.getTime() - Date.parse(h.oldestPendingAt)) / HOUR) : null;
  return {
    key: "outboxHealth",
    label: "Shipment updates waiting",
    value: h.pending + h.failed,
    unit: "updates",
    n: h.pending + h.failed,
    measured: "Shipment updates the gate stamps still owe to Shipments, right now (not filtered by the period): pending = being retried, failed = stopped, need a hand.",
    notMeasured: "",
    breakdown: [part("Pending", h.pending, "updates", h.pending, 0), part("Failed", h.failed, "updates", h.failed, 0), part("Oldest pending", ageHours, "hours", h.pending)],
  };
}

// ---------- tables ----------

function throughputBuckets(receivedIn: Row[], leftIn: Row[], period: KpiPeriod): KpiThroughputBucket[] {
  const daily = periodDays(period) <= KPI_DAILY_MAX_DAYS;
  const keyOf = (day: string) => (daily ? day : isoWeek(day).monday);
  const buckets = new Map<string, KpiThroughputBucket>();
  for (let day = period.from; day <= period.to; day = addDays(day, 1)) {
    const key = keyOf(day);
    if (!buckets.has(key)) {
      const label = daily ? `${Number(day.slice(8))}.${Number(day.slice(5, 7))}.` : `W${isoWeek(day).week}`;
      buckets.set(key, { key, label, inPositions: 0, inPieces: 0, inKg: 0, inCbm: 0, outPositions: 0, outPieces: 0, outKg: 0, outCbm: 0 });
    }
  }
  for (const r of receivedIn) {
    const b = buckets.get(keyOf(r.receipt!.day));
    if (!b) continue;
    b.inPositions += 1;
    b.inPieces += r.m.colli;
    b.inKg += r.m.weightKg;
    b.inCbm += r.m.measureCbm;
  }
  for (const r of leftIn) {
    const b = buckets.get(keyOf(r.left!.day));
    if (!b) continue;
    b.outPositions += 1;
    b.outPieces += r.m.colli;
    b.outKg += r.m.weightKg;
    b.outCbm += r.m.measureCbm;
  }
  return [...buckets.values()].map((b) => ({ ...b, inKg: Math.round(b.inKg), outKg: Math.round(b.outKg), inCbm: round(b.inCbm, 2), outCbm: round(b.outCbm, 2) }));
}

function topCustomers(received: KpiMovement[]): TopCustomer[] {
  const total = sum(received, (m) => m.measureCbm);
  const by = new Map<string, { jobs: number; cbm: number; wm: number }>();
  for (const m of received) {
    const key = m.customer || "(no customer)";
    const e = by.get(key) ?? { jobs: 0, cbm: 0, wm: 0 };
    e.jobs += 1;
    e.cbm += m.measureCbm;
    e.wm += Math.max(m.measureCbm, m.weightKg / 1000);
    by.set(key, e);
  }
  return [...by.entries()]
    .sort((a, b) => b[1].cbm - a[1].cbm || b[1].jobs - a[1].jobs)
    .slice(0, 10)
    .map(([customer, e]) => ({ customer, jobs: e.jobs, cbm: round(e.cbm), wm: round(e.wm), share: total ? Math.round((e.cbm / total) * 100) : 0 }));
}

const containerInDay = (c: KpiContainer) => (c.gateInAt ? pragueDate(c.gateInAt) : isIsoDate(c.gatedIn) ? c.gatedIn : "");
const containerOutDay = (c: KpiContainer) => (c.gateOutAt ? pragueDate(c.gateOutAt) : isIsoDate(c.gatedOut) ? c.gatedOut : "");

function monthlySummary(rows: Row[], containers: KpiContainer[], now: Date): MonthlySummary[] {
  const today = pragueDate(now);
  const y = Number(today.slice(0, 4));
  const mo = Number(today.slice(5, 7));
  return Array.from({ length: 4 }, (_, i) => {
    const first = new Date(Date.UTC(y, mo - 1 - i, 1)).toISOString().slice(0, 10);
    const next = new Date(Date.UTC(y, mo - i, 1)).toISOString().slice(0, 10);
    const key = first.slice(0, 7);
    const received = rows.filter((r) => r.receipt?.day.startsWith(key));
    const left = rows.filter((r) => r.left?.day.startsWith(key));
    const firstDay = dayNo(first);
    const endDay = Math.min(dayNo(next), dayNo(today) + 1);
    const yardContainerDays = containers.reduce((a, c) => {
      const inDay = containerInDay(c);
      if (!inDay) return a;
      const outDay = containerOutDay(c);
      const out = outDay ? dayNo(outDay) : dayNo(today) + 1;
      return a + Math.max(0, Math.min(out, endDay) - Math.max(dayNo(inDay), firstDay));
    }, 0);
    return {
      month: key,
      monthToDate: i === 0,
      receipts: received.length,
      cbmIn: round(sum(received, (r) => r.m.measureCbm)),
      dispatches: left.length,
      cbmOut: round(sum(left, (r) => r.m.measureCbm)),
      consolPositions: received.filter((r) => r.m.loadType === "Consolidation").length,
      containersLoaded: containers.filter((c) => c.direction === "Loading" && containerOutDay(c).startsWith(key)).length,
      fclStuffed: left.filter((r) => r.m.operationType === "FCL stuffing").length,
      fclStripped: received.filter((r) => r.m.operationType === "FCL stripping").length,
      yardContainerDays,
    };
  });
}

function laneFill(containers: KpiContainer[], houses: KpiHouse[], movements: KpiMovement[], inPeriod: (day: string) => boolean): LaneFill[] {
  const byId = new Map(movements.map((m) => [m.id, m]));
  const byLane = new Map<string, { n: number; cbm: number; cap: number; fill: number; pieces: number }>();
  for (const c of containers) {
    const cap = EQUIPMENT_CAPACITY_CBM[c.equipment];
    if (c.direction !== "Loading" || !cap || !inPeriod(containerOutDay(c))) continue;
    // The stuffed houses' gate figures; the typed container cbm when no house is stuffed.
    const stuffed = houses.filter((h) => h.containerId === c.id && h.stuffedAt).map((h) => byId.get(h.movementId)).filter((m): m is KpiMovement => !!m);
    const cbm = stuffed.length ? sum(stuffed, (m) => m.measureCbm) : c.cbm;
    if (cbm == null || cbm <= 0) continue;
    const pieces = stuffed.length ? sum(stuffed, (m) => m.colli) : (c.pieces ?? 0);
    const lane = c.dischargePort || "(no discharge port)";
    const e = byLane.get(lane) ?? { n: 0, cbm: 0, cap: 0, fill: 0, pieces: 0 };
    e.n += 1;
    e.cbm += cbm;
    e.cap += cap;
    e.fill += cbm / cap;
    e.pieces += pieces;
    byLane.set(lane, e);
  }
  return [...byLane.entries()]
    .map(([lane, e]) => {
      const fill = Math.round((e.fill / e.n) * 100);
      return { lane, containers: e.n, avgCbm: round(e.cbm / e.n), capacityCbm: Math.round(e.cap / e.n), fill, avgPieces: round(e.pieces / e.n), verdict: fill >= 80 ? "Healthy" : fill >= 60 ? "Acceptable" : "Below target" };
    })
    .sort((a, b) => a.fill - b.fill);
}

function storageNow(movements: KpiMovement[], now: Date) {
  const running = movements.map((m) => movementStorage(m, now)).filter((s) => s.started && !s.stopped);
  return {
    inWarehouse: running.length,
    expiring: running.filter((s) => s.state === "Expiring").length,
    chargeable: running.filter((s) => s.state === "Chargeable").length,
    estimatedCzk: running.reduce((a, s) => a + s.estimatedCzk, 0),
  };
}
