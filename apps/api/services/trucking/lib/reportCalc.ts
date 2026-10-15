import { addDays, businessDay, isRealYmd } from "../../../lib/businessDate";
import { addWorkingDays, isWorkingDay } from "../../../lib/workingDays";
import type { HaulierStatus, LtlTripKind } from "../interfaces/interfaces";
import type { DepartmentResult, HaulierScore, MarginRow, TruckingKpi, TruckingKpiPart } from "../interfaces/reports.interfaces";
import { POD_MISSING_WORKING_DAYS } from "./avizaceRules";

// The Reports KPIs of Trucking (Phase 7), worked out from the grouped rows the reports repository
// reads (SQL does the counting and summing per group; nothing here sees a single consignment).
// Every KPI says where it starts and stops, which consignments it counts and how many. When
// nothing can be measured the value is null with the reason. Pure; days are Prague days.

/** Periods longer than this are refused. */
export const REPORT_MAX_DAYS = 366;

const DAY = 86_400_000;

// ---------- inputs: the grouped rows ----------

/** Consignments delivered in the period, per scope × service level × internal. */
export interface DeliveredGroup {
  scope: "FTL" | "LTL";
  /** "" = none */
  serviceLevel: string;
  internal: boolean;
  delivered: number;
  /** With a FAILED_DELIVERY exception caused by the customer (left out of on time) */
  customerFailed: number;
  /** Not customer-failed and without a final promised date */
  noPromise: number;
  /** Not customer-failed, delivered (Prague day) on or before the final promised date */
  onTime: number;
  /** With any FAILED_DELIVERY exception */
  failed: number;
  avizaceNeeded: number;
  /** Needed, and recorded before the delivery */
  avizaceBefore: number;
  /** With a haulier cost (real or estimate) */
  costed: number;
  /** Of `costed`: every priced part has an approved haulier invoice */
  costReal: number;
  costCzk: number;
  /** Σ chargeable kg of `costed` */
  costKg: number;
  /** Σ pallet places of `costed` */
  pallets: number;
  /** Σ cost of `costed` with pallet places */
  palletCostCzk: number;
  /** With both a sell and a cost */
  margined: number;
  marginSellCzk: number;
  marginBuyCzk: number;
  /** Of `margined`: below the margin floor */
  belowFloor: number;
  /** Σ sell (CZK) of every consignment with a sell */
  sellCzk: number;
}

/** A margin group of Road (not internal) consignments with a sell and a cost. */
export interface MarginGroup {
  dim: "customer" | "lane" | "serviceLevel";
  /** customer id · "11000>60200" · service level ("" = none) */
  key: string;
  /** The customer name (customer groups) */
  label: string;
  consignments: number;
  sellCzk: number;
  buyCzk: number;
  belowFloor: number;
}

/** Delivered (Prague day) → POD received (Prague day), counted. */
export interface PodPair {
  deliveredDay: string;
  podDay: string;
  /** The delivering haulier; null when no leg names one */
  haulierId: string | null;
  n: number;
}

/** Delivered, not cancelled, without POD (now, not the period), per delivered day and haulier. */
export interface PodOpen {
  deliveredDay: string;
  haulierId: string | null;
  haulierName: string | null;
  n: number;
}

/** An LTL line haul or delivery run that departed in the period, with what its legs carry. */
export interface FillTrip {
  kind: Extract<LtlTripKind, "LINEHAUL" | "DELIVERY_RUN">;
  /** null when no vehicle type is set (or it is no longer in the settings) */
  capacity: { ldm: number; kg: number } | null;
  ldm: number;
  kg: number;
}

export interface ExceptionGroup {
  kind: string;
  decision: string;
  n: number;
}

export interface FailedReasonGroup {
  reason: string;
  n: number;
}

/** Of the consignments a haulier delivered (the last leg). */
export interface HaulierPerf {
  haulierId: string;
  haulierName: string | null;
  delivered: number;
  /** Not customer-failed, with a final promised date */
  measured: number;
  onTime: number;
  failed: number;
}

/** The haulier's parts (trips, partner deliveries) of the period's delivered consignments. */
export interface HaulierCost {
  haulierId: string;
  haulierName: string | null;
  trips: number;
  consignments: number;
  costCzk: number;
  /** Σ chargeable kg of the consignments with a cost part */
  costKg: number;
}

/** An amount of a haulier in its currency on a day (claims, invoice differences). */
export interface HaulierAmount {
  haulierId: string;
  currency: string;
  day: string;
  n: number;
  amount: number;
}

export interface InternalGroup {
  department: string;
  amountCzk: number;
  consignments: number;
}

export interface ReportInput {
  delivered: DeliveredGroup[];
  podPairs: PodPair[];
  podOpen: PodOpen[];
  fillTrips: FillTrip[];
  exceptions: ExceptionGroup[];
  failedReasons: FailedReasonGroup[];
  /** Company holidays on top of the statutory ones */
  holidays: readonly string[];
  /** Service level code → label */
  levelLabels: Map<string, string>;
  /** Haulier id → name */
  haulierNames: Map<string, string>;
}

export interface ReportPeriod {
  from: string;
  to: string;
}

// ---------- small helpers ----------

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const money = (n: number) => round(n, 2);
const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + (f(r) || 0), 0);
const pct = (part: number, of: number) => (of > 0 ? (part / of) * 100 : null);
const part = (label: string, value: number | null, unit: string, n: number, d = 1): TruckingKpiPart => ({ label, value: value == null ? null : round(value, d), unit, n });
const notes = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" · ");

/** Days from `from` to `to`, both included. */
export const periodDays = (p: ReportPeriod) => Math.round((Date.parse(`${p.to}T00:00:00Z`) - Date.parse(`${p.from}T00:00:00Z`)) / DAY) + 1;

/**
 * The period asked for, checked: from/to are Prague days (YYYY-MM-DD), both included; missing
 * means the last 7 days to today. Returns an error text when it cannot be used.
 */
export function resolvePeriod(from: string | undefined, to: string | undefined, now = new Date()): ReportPeriod | { error: string } {
  const t = to?.trim() || businessDay(now);
  const f = from?.trim() || addDays(t, -6);
  if (!isRealYmd(f) || !isRealYmd(t)) return { error: "The period needs dates as YYYY-MM-DD" };
  if (f > t) return { error: "The period starts after it ends" };
  if (periodDays({ from: f, to: t }) > REPORT_MAX_DAYS) return { error: `The period can be at most ${REPORT_MAX_DAYS} days` };
  return { from: f, to: t };
}

/** Working days after `from` up to and including `to` (0 on the same day or when `to` is earlier). */
export function workingDaysBetween(from: string, to: string, holidays: readonly string[] = []): number {
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkingDay(d, holidays)) n += 1;
  return n;
}

/** Nearest-rank percentile of counted values. */
export function weightedPercentile(values: { value: number; n: number }[], p: number): number | null {
  const sorted = values.filter((v) => v.n > 0).sort((a, b) => a.value - b.value);
  const total = sum(sorted, (v) => v.n);
  if (!total) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * total));
  let seen = 0;
  for (const v of sorted) {
    seen += v.n;
    if (seen >= rank) return v.value;
  }
  return sorted[sorted.length - 1]!.value;
}

/** An amount in CZK: EUR at the ČNB rate of its day (`eur`); null when that rate is unknown. */
export function czkOf(amount: number, currency: string, day: string, eur: Map<string, number | null>): number | null {
  if (currency === "CZK") return amount;
  const rate = eur.get(day);
  return currency === "EUR" && rate ? amount * rate : null;
}

const SCOPES = ["FTL", "LTL"] as const;
const levelName = (code: string, labels: Map<string, string>) => (code ? (labels.get(code) ?? code) : "No service level");

/** Groups merged per key (service level, scope …). */
function byKey(groups: DeliveredGroup[], keyOf: (g: DeliveredGroup) => string): Map<string, DeliveredGroup[]> {
  const out = new Map<string, DeliveredGroup[]>();
  for (const g of groups) out.set(keyOf(g), [...(out.get(keyOf(g)) ?? []), g]);
  return out;
}

// ---------- the KPIs ----------

export function onTimeKpi(groups: DeliveredGroup[], levelLabels: Map<string, string>): TruckingKpi {
  const delivered = sum(groups, (g) => g.delivered);
  const excluded = sum(groups, (g) => g.customerFailed);
  const noPromise = sum(groups, (g) => g.noPromise);
  const measured = (gs: DeliveredGroup[]) => sum(gs, (g) => g.delivered - g.customerFailed - g.noPromise);
  const onTime = (gs: DeliveredGroup[]) => sum(gs, (g) => g.onTime);
  const n = measured(groups);
  const levelParts = [...byKey(groups, (g) => g.serviceLevel).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, gs]) => part(levelName(code, levelLabels), pct(onTime(gs), measured(gs)), "%", measured(gs)));
  const scopeParts = SCOPES.map((s) => {
    const gs = groups.filter((g) => g.scope === s);
    return part(s, pct(onTime(gs), measured(gs)), "%", measured(gs));
  });
  return {
    key: "onTime",
    label: "On time",
    value: n ? round(pct(onTime(groups), n)!) : null,
    unit: "%",
    n,
    measured:
      "Delivered consignments whose delivered date (Prague) is on or before the final promised date: FTL the date promised from the planned pick-up, LTL the date promised from the confirmed gate-in at our warehouse. Counts consignments delivered in the period.",
    notMeasured: notes(
      !delivered && "No consignment delivered in this period",
      delivered > 0 && !n && "No delivered consignment had a final promised date",
      excluded > 0 && `${excluded} with a failed delivery caused by the customer are left out`,
      noPromise > 0 && `${noPromise} without a final promised date (no service level, or LTL without a confirmed gate-in) are not counted`,
    ),
    breakdown: [part("Late", n - onTime(groups), "consignments", n, 0), ...scopeParts, ...levelParts],
  };
}

const FAILED_REASON_LABELS: Record<string, string> = {
  CLOSED: "Closed",
  ABSENT: "Nobody there",
  REFUSED: "Refused",
  WRONG_ADDRESS: "Wrong address",
  REFUSED_DAMAGED: "Refused, damaged",
  NO_AVIZACE: "No avizace",
  OTHER: "Other",
};

export function firstAttemptKpi(groups: DeliveredGroup[], reasons: FailedReasonGroup[]): TruckingKpi {
  const delivered = sum(groups, (g) => g.delivered);
  const failed = sum(groups, (g) => g.failed);
  return {
    key: "firstAttempt",
    label: "First attempt",
    value: delivered ? round(pct(delivered - failed, delivered)!) : null,
    unit: "%",
    n: delivered,
    measured: "Delivered consignments without any failed-delivery exception ÷ all consignments delivered in the period (whoever caused the failure).",
    notMeasured: delivered ? "" : "No consignment delivered in this period",
    breakdown: [
      part("Failed at least once", failed, "consignments", delivered, 0),
      ...[...reasons].sort((a, b) => b.n - a.n).map((r) => part(FAILED_REASON_LABELS[r.reason] ?? r.reason, r.n, "exceptions", r.n, 0)),
    ],
  };
}

/** Working days from delivered to POD of each pair, counted. */
const podDays = (pairs: PodPair[], holidays: readonly string[]) => pairs.map((p) => ({ value: workingDaysBetween(p.deliveredDay, p.podDay, holidays), n: p.n }));

export function daysToPodKpi(pairs: PodPair[], delivered: number, holidays: readonly string[]): TruckingKpi {
  const values = podDays(pairs, holidays);
  const n = sum(values, (v) => v.n);
  const avg = n ? sum(values, (v) => v.value * v.n) / n : null;
  const withoutPod = delivered - n;
  return {
    key: "daysToPod",
    label: "Days to POD",
    value: avg == null ? null : round(avg),
    unit: "working days",
    n,
    measured:
      "Average working days (Czech holidays and the company's own left out) from the delivered day to the day the POD was received, both Prague days; the same day is 0. Counts consignments delivered in the period that have their POD.",
    notMeasured: notes(!n && "No consignment delivered in this period has its POD yet", withoutPod > 0 && `${withoutPod} delivered without a POD yet are not counted`),
    breakdown: [part("P90", weightedPercentile(values, 90), "working days", n), part("Without POD yet", withoutPod, "consignments", withoutPod, 0)],
  };
}

/** Whether a POD delivered on `day` is missing on `today` (the POD-missing view's rule). */
export const podOverdue = (deliveredDay: string, today: string, holidays: readonly string[]) => addWorkingDays(deliveredDay, POD_MISSING_WORKING_DAYS, holidays) < today;

export function podMissingKpi(open: PodOpen[], today: string, holidays: readonly string[], haulierNames: Map<string, string>): TruckingKpi {
  const missing = open.filter((o) => podOverdue(o.deliveredDay, today, holidays));
  const n = sum(missing, (o) => o.n);
  const perHaulier = new Map<string, { name: string; n: number }>();
  for (const o of missing) {
    const key = o.haulierId ?? "";
    const name = o.haulierId ? (haulierNames.get(o.haulierId) ?? o.haulierName ?? "Unknown haulier") : "No haulier";
    perHaulier.set(key, { name, n: (perHaulier.get(key)?.n ?? 0) + o.n });
  }
  return {
    key: "podMissing",
    label: "POD missing",
    value: n,
    unit: "consignments",
    n,
    measured: `Consignments delivered more than ${POD_MISSING_WORKING_DAYS} working days ago that still have no POD, right now (not filtered by the period) — the same rule as the "POD missing" view.`,
    notMeasured: "",
    breakdown: [...perHaulier.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "cs")).map((h) => part(h.name, h.n, "consignments", h.n, 0)),
  };
}

const KIND_LABELS = { LINEHAUL: "Line haul", DELIVERY_RUN: "Delivery run" } as const;

/** How full a trip left: the fuller of LDM and kg against the vehicle's capacity (%). */
export const tripFillPercent = (t: FillTrip): number | null => {
  if (!t.capacity) return null;
  const ldm = t.capacity.ldm > 0 ? (t.ldm / t.capacity.ldm) * 100 : null;
  const kg = t.capacity.kg > 0 ? (t.kg / t.capacity.kg) * 100 : null;
  return ldm == null && kg == null ? null : Math.max(ldm ?? 0, kg ?? 0);
};

export function lineHaulFillKpi(trips: FillTrip[]): TruckingKpi {
  const fills = (ts: FillTrip[]) => ts.map(tripFillPercent).filter((x): x is number => x !== null);
  const avg = (xs: number[]) => (xs.length ? sum(xs, (x) => x) / xs.length : null);
  const all = fills(trips);
  const noVehicle = trips.length - all.length;
  return {
    key: "lineHaulFill",
    label: "Fill",
    value: all.length ? round(avg(all)!) : null,
    unit: "%",
    n: all.length,
    measured:
      "Average fill of the LTL line hauls and delivery runs that departed in the period: per trip the fuller of loading metres and weight of the consignments on it, against the capacity of its vehicle type (Trucking settings).",
    notMeasured: notes(!trips.length && "No line haul or delivery run departed in this period", trips.length > 0 && !all.length && "No departed trip has a vehicle type", all.length > 0 && noVehicle > 0 && `${noVehicle} trip(s) without a vehicle type are not counted`),
    breakdown: (["LINEHAUL", "DELIVERY_RUN"] as const).map((k) => {
      const f = fills(trips.filter((t) => t.kind === k));
      return part(KIND_LABELS[k], avg(f), "%", f.length);
    }),
  };
}

export function costPerKgKpi(groups: DeliveredGroup[]): TruckingKpi {
  const costed = sum(groups, (g) => g.costed);
  const delivered = sum(groups, (g) => g.delivered);
  const kg = sum(groups, (g) => g.costKg);
  const real = sum(groups, (g) => g.costReal);
  const perKg = (gs: DeliveredGroup[]) => {
    const k = sum(gs, (g) => g.costKg);
    return k > 0 ? sum(gs, (g) => g.costCzk) / k : null;
  };
  return {
    key: "costPerKg",
    label: "Cost per kg",
    value: kg > 0 ? round(perKg(groups)!, 2) : null,
    unit: "CZK/kg",
    n: costed,
    measured:
      "Haulier cost ÷ chargeable kg of the consignments delivered in the period (Road and internal). Cost = the real amount of an approved haulier invoice where there is one, else the estimate: the FTL trip's buy price, the LTL legs' shares of their trips and the partner's delivery price, else the cheapest buy price when the consignment was priced. EUR at the rate stored with each price.",
    notMeasured: notes(!costed && "No consignment delivered in this period has a haulier cost", delivered - costed > 0 && `${delivered - costed} delivered without any haulier cost are not counted`),
    breakdown: [
      ...SCOPES.map((s) => {
        const gs = groups.filter((g) => g.scope === s);
        return part(s, perKg(gs), "CZK/kg", sum(gs, (g) => g.costed), 2);
      }),
      part("Real cost (approved invoice)", real, "consignments", real, 0),
      part("Estimate", costed - real, "consignments", costed - real, 0),
    ],
  };
}

export function costPerPalletKpi(groups: DeliveredGroup[]): TruckingKpi {
  const pallets = sum(groups, (g) => g.pallets);
  const perPallet = (gs: DeliveredGroup[]) => {
    const p = sum(gs, (g) => g.pallets);
    return p > 0 ? sum(gs, (g) => g.palletCostCzk) / p : null;
  };
  return {
    key: "costPerPallet",
    label: "Cost per pallet place",
    value: pallets > 0 ? round(perPallet(groups)!, 2) : null,
    unit: "CZK/pallet place",
    n: round(pallets, 2),
    measured: "Haulier cost (as in Cost per kg) ÷ pallet places of the consignments delivered in the period that have pallet places and a cost.",
    notMeasured: pallets > 0 ? "" : "No consignment delivered in this period has pallet places and a haulier cost",
    breakdown: SCOPES.map((s) => {
      const gs = groups.filter((g) => g.scope === s);
      return part(s, perPallet(gs), "CZK/pallet place", round(sum(gs, (g) => g.pallets), 2), 2);
    }),
  };
}

export function marginKpi(groups: DeliveredGroup[]): TruckingKpi {
  const road = groups.filter((g) => !g.internal);
  const internal = sum(groups.filter((g) => g.internal), (g) => g.delivered);
  const sell = sum(road, (g) => g.marginSellCzk);
  const buy = sum(road, (g) => g.marginBuyCzk);
  const n = sum(road, (g) => g.margined);
  const notPriced = sum(road, (g) => g.delivered) - n;
  const below = sum(road, (g) => g.belowFloor);
  return {
    key: "margin",
    label: "Margin",
    value: sell > 0 ? round(pct(sell - buy, sell)!) : null,
    unit: "%",
    n,
    measured:
      "Σ (sell − haulier cost) ÷ Σ sell of the Road consignments delivered in the period (internal billing left out). Haulier cost as in Cost per kg (real where invoiced and approved, else estimate). The floor is the one in the Trucking settings.",
    notMeasured: notes(!n && "No Road consignment delivered in this period has both a sell price and a cost", n > 0 && sell <= 0 && "The sell prices add up to 0", notPriced > 0 && `${notPriced} without a sell price or a cost are not counted`),
    breakdown: [
      part("Margin", sell - buy, "CZK", n, 2),
      part("Below the floor", below, "consignments", n, 0),
      part("Internal (left out)", internal, "consignments", internal, 0),
      part("Not priced", notPriced, "consignments", notPriced, 0),
    ],
  };
}

const KIND_NAMES: Record<string, string> = {
  FAILED_DELIVERY: "Failed delivery",
  DAMAGE: "Damage",
  SHORTAGE: "Shortage",
  OVERAGE: "Overage",
  WAITING_TIME: "Waiting time",
  REDELIVERY: "Redelivery",
  OTHER: "Other",
};
const DECISION_NAMES: Record<string, string> = { PENDING: "Pending", CHARGE_CUSTOMER: "Charged to the customer", CLAIM_HAULIER: "Claimed from the haulier", ABSORB: "Absorbed" };

export function exceptionRateKpi(groups: ExceptionGroup[], delivered: number): TruckingKpi {
  const total = sum(groups, (g) => g.n);
  const per100 = (k: number) => (delivered ? (k / delivered) * 100 : null);
  const merged = (keyOf: (g: ExceptionGroup) => string) => {
    const m = new Map<string, number>();
    for (const g of groups) m.set(keyOf(g), (m.get(keyOf(g)) ?? 0) + g.n);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  return {
    key: "exceptionRate",
    label: "Exception rate",
    value: delivered ? round(per100(total)!) : null,
    unit: "per 100 consignments",
    n: total,
    measured: "Delivery exceptions created in the period (any kind) per 100 consignments delivered in the period (an exception may belong to a consignment delivered earlier or later).",
    notMeasured: delivered ? "" : `No consignment delivered in this period${total ? ` (${total} exception(s) created)` : ""}`,
    breakdown: [
      ...merged((g) => g.kind).map(([k, n]) => part(KIND_NAMES[k] ?? k, per100(n), "per 100", n)),
      ...merged((g) => g.decision).map(([d, n]) => part(DECISION_NAMES[d] ?? d, n, "exceptions", n, 0)),
    ],
  };
}

export function avizaceDoneKpi(groups: DeliveredGroup[]): TruckingKpi {
  const needed = sum(groups, (g) => g.avizaceNeeded);
  const before = sum(groups, (g) => g.avizaceBefore);
  return {
    key: "avizaceDone",
    label: "Avizace done",
    value: needed ? round(pct(before, needed)!) : null,
    unit: "%",
    n: needed,
    measured: "Of the consignments delivered in the period that needed an avizace (B2C, or the delivery stop asks for one): the share with an avizace recorded before the delivery.",
    notMeasured: needed ? "" : "No consignment delivered in this period needed an avizace",
    breakdown: [part("Recorded before delivery", before, "consignments", needed, 0), part("Missing or late", needed - before, "consignments", needed, 0)],
  };
}

export function buildKpis(input: ReportInput, today: string): TruckingKpi[] {
  const delivered = sum(input.delivered, (g) => g.delivered);
  return [
    onTimeKpi(input.delivered, input.levelLabels),
    firstAttemptKpi(input.delivered, input.failedReasons),
    daysToPodKpi(input.podPairs, delivered, input.holidays),
    podMissingKpi(input.podOpen, today, input.holidays, input.haulierNames),
    lineHaulFillKpi(input.fillTrips),
    costPerKgKpi(input.delivered),
    costPerPalletKpi(input.delivered),
    marginKpi(input.delivered),
    exceptionRateKpi(input.exceptions, delivered),
    avizaceDoneKpi(input.delivered),
  ];
}

// ---------- margin tables ----------

const marginRow = (g: Pick<MarginGroup, "key" | "consignments" | "sellCzk" | "buyCzk" | "belowFloor">, label: string): MarginRow => ({
  key: g.key,
  label,
  consignments: g.consignments,
  sellCzk: money(g.sellCzk),
  buyCzk: money(g.buyCzk),
  marginCzk: money(g.sellCzk - g.buyCzk),
  marginPercent: g.sellCzk > 0 ? round(((g.sellCzk - g.buyCzk) / g.sellCzk) * 100, 2) : null,
  belowFloor: g.belowFloor,
});

/** "11000" → "110 00" */
const showPostcode = (p: string) => (/^\d{5}$/.test(p) ? `${p.slice(0, 3)} ${p.slice(3)}` : p || "?");

/** "110 00 → 602 00 (zones 1 → 4)"; the zones of the Standard sell list when it has them. */
export function laneLabel(key: string, zoneOf: (postcode: string) => string | null): string {
  const [from = "", to = ""] = key.split(">");
  const zf = zoneOf(from);
  const zt = zoneOf(to);
  const zones = zf || zt ? ` (zones ${zf ?? "?"} → ${zt ?? "?"})` : "";
  return `${showPostcode(from)} → ${showPostcode(to)}${zones}`;
}

/** The three margin tables, the biggest sell first. */
export function marginTables(groups: MarginGroup[], levelLabels: Map<string, string>, zoneOf: (postcode: string) => string | null) {
  const table = (dim: MarginGroup["dim"], labelOf: (g: MarginGroup) => string) =>
    groups
      .filter((g) => g.dim === dim)
      .map((g) => marginRow(g, labelOf(g)))
      .sort((a, b) => b.sellCzk - a.sellCzk || a.label.localeCompare(b.label, "cs"));
  return {
    marginByCustomer: table("customer", (g) => g.label || "(no name)"),
    marginByLane: table("lane", (g) => laneLabel(g.key, zoneOf)),
    marginByServiceLevel: table("serviceLevel", (g) => levelName(g.key, levelLabels)),
  };
}

// ---------- haulier scorecard ----------

export interface HaulierInput {
  perf: HaulierPerf[];
  costs: HaulierCost[];
  podPairs: PodPair[];
  claims: HaulierAmount[];
  invoicesBlocked: { haulierId: string; n: number }[];
  invoiceDifferences: HaulierAmount[];
  holidays: readonly string[];
  /** EUR → CZK rate per day (claims, invoice differences); null = no ČNB rate */
  eur: Map<string, number | null>;
  names: Map<string, string>;
  statuses: Map<string, HaulierStatus>;
}

export function haulierScores(input: HaulierInput): HaulierScore[] {
  const ids = new Set([
    ...input.perf.map((x) => x.haulierId),
    ...input.costs.map((x) => x.haulierId),
    ...input.claims.map((x) => x.haulierId),
    ...input.invoicesBlocked.map((x) => x.haulierId),
    ...input.invoiceDifferences.map((x) => x.haulierId),
  ]);
  const czk = (rows: HaulierAmount[]) => sum(rows, (r) => czkOf(r.amount, r.currency, r.day, input.eur) ?? 0);
  return [...ids]
    .map((id): HaulierScore => {
      const perf = input.perf.find((x) => x.haulierId === id);
      const cost = input.costs.find((x) => x.haulierId === id);
      const pods = podDays(
        input.podPairs.filter((p) => p.haulierId === id),
        input.holidays,
      );
      const podN = sum(pods, (p) => p.n);
      const claims = input.claims.filter((c) => c.haulierId === id);
      return {
        haulierCustomerId: id,
        name: input.names.get(id) ?? perf?.haulierName ?? cost?.haulierName ?? "Unknown haulier",
        trips: cost?.trips ?? 0,
        consignments: cost?.consignments ?? perf?.delivered ?? 0,
        onTimePercent: perf && perf.measured ? round(pct(perf.onTime, perf.measured)!) : null,
        firstAttemptPercent: perf && perf.delivered ? round(pct(perf.delivered - perf.failed, perf.delivered)!) : null,
        avgDaysToPod: podN ? round(sum(pods, (p) => p.value * p.n) / podN) : null,
        claims: sum(claims, (c) => c.n),
        claimedCzk: money(czk(claims)),
        costCzk: money(cost?.costCzk ?? 0),
        costPerKg: cost && cost.costKg > 0 ? round(cost.costCzk / cost.costKg, 2) : null,
        invoicesBlocked: input.invoicesBlocked.find((x) => x.haulierId === id)?.n ?? 0,
        invoiceDifferenceCzk: money(czk(input.invoiceDifferences.filter((x) => x.haulierId === id))),
        status: input.statuses.get(id) ?? "blocked",
      };
    })
    .sort((a, b) => b.consignments - a.consignments || a.name.localeCompare(b.name, "cs"));
}

// ---------- department result ----------

export function departmentResult(groups: DeliveredGroup[], internal: InternalGroup[]): DepartmentResult {
  const externalSellCzk = money(sum(groups.filter((g) => !g.internal), (g) => g.sellCzk));
  const internalChargesCzk = money(sum(internal, (g) => g.amountCzk));
  const haulierCostCzk = money(sum(groups, (g) => g.costCzk));
  return {
    externalSellCzk,
    internalChargesCzk,
    haulierCostCzk,
    resultCzk: money(externalSellCzk + internalChargesCzk - haulierCostCzk),
    internalByDepartment: internal
      .map((g) => ({ department: g.department, amountCzk: money(g.amountCzk), consignments: g.consignments }))
      .sort((a, b) => b.amountCzk - a.amountCzk || a.department.localeCompare(b.department, "cs")),
  };
}
