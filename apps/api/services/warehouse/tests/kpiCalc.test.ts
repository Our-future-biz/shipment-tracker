import { describe, expect, it } from "vitest";
import { buildKpiReport, resolvePeriod, type KpiInput, type KpiMovement } from "../services/kpiCalc";
import { leftOf, receiptOf } from "../services/kpiStamps";
import type { WarehouseKpi } from "../interfaces/kpi.interfaces";

// Pure: no database. Runs with the warehouse tests (WAREHOUSE_DB_TESTS=1).

const at = (s: string) => new Date(s);
let seq = 0;
const mv = (over: Partial<KpiMovement>): KpiMovement => ({
  id: `m${++seq}`,
  visit: "příjem",
  customer: "",
  colli: 0,
  loadType: "",
  operationType: "",
  gateIn: null,
  gateOut: null,
  impRelease: null,
  expReceipt: null,
  receivedAt: null,
  leftAt: null,
  loadInDate: "",
  freeDays: null,
  measureCbm: 0,
  weightKg: 0,
  ...over,
});
const empty = (over: Partial<KpiInput> = {}): KpiInput => ({
  movements: [],
  containers: [],
  houses: [],
  slots: [],
  reweighs: [],
  exceptions: [],
  shipmentUpdates: { pending: 0, failed: 0, oldestPendingAt: null },
  ...over,
});
const kpi = (r: { kpis: WarehouseKpi[] }, key: string) => r.kpis.find((k) => k.key === key)!;
const NOW = at("2026-10-15T10:00:00Z");
const P = { from: "2026-10-09", to: "2026-10-15" };

describe("receipt and left points", () => {
  it("inbound is received at the WH receipt, never the truck gate-in", () => {
    expect(receiptOf(mv({ gateIn: at("2026-10-10T08:00:00Z") }))).toBeNull();
    expect(receiptOf(mv({ gateIn: at("2026-10-10T08:00:00Z"), expReceipt: at("2026-10-10T22:30:00Z") }))).toMatchObject({ day: "2026-10-11", source: "WH receipt" });
  });

  it("outbound is received at the tally tick, or the typed date only without a container tally", () => {
    expect(receiptOf(mv({ visit: "výdej", gateIn: at("2026-10-12T08:00:00Z") }))).toBeNull();
    expect(receiptOf(mv({ visit: "výdej", loadInDate: "2026-10-12" }))).toMatchObject({ at: null, day: "2026-10-12", source: "Received date (typed)" });
    expect(receiptOf(mv({ visit: "výdej", loadInDate: "2026-10-12" }), { addedBy: "u1", containerDirection: "Unloading" })).toBeNull();
    expect(receiptOf(mv({ visit: "výdej", loadInDate: "2026-10-12" }), { addedBy: "migration", containerDirection: "Unloading" })).toMatchObject({ day: "2026-10-12" });
    expect(receiptOf(mv({ visit: "výdej", receivedAt: at("2026-10-12T09:00:00Z") }))).toMatchObject({ source: "Stripping tally" });
  });

  it("leaves at the container gate-out (inbound stuffed) or the WH release", () => {
    expect(leftOf(mv({ leftAt: at("2026-10-14T10:00:00Z"), impRelease: at("2026-10-13T10:00:00Z") }))).toMatchObject({ source: "Container gate-out" });
    expect(leftOf(mv({ impRelease: at("2026-10-13T10:00:00Z") }))).toMatchObject({ source: "WH release" });
    expect(leftOf(mv({ visit: "výdej", gateOut: at("2026-10-13T10:00:00Z") }))).toBeNull();
  });
});

describe("period", () => {
  it("defaults to the last 7 Prague days and refuses bad periods", () => {
    expect(resolvePeriod(undefined, undefined, at("2026-10-14T22:30:00Z"))).toEqual({ from: "2026-10-09", to: "2026-10-15" });
    expect(resolvePeriod("2026-10-10", "2026-10-09")).toEqual({ error: expect.stringMatching(/starts after/) });
    expect(resolvePeriod("2025-01-01", "2026-10-09")).toEqual({ error: expect.stringMatching(/366/) });
    expect(resolvePeriod("10.10.2026", "2026-10-11")).toEqual({ error: expect.stringMatching(/YYYY-MM-DD/) });
  });
});

describe("KPIs from stamps", () => {
  it("say 'not measured' instead of inventing a figure", () => {
    const r = buildKpiReport(empty(), P, NOW);
    for (const key of ["dwell", "gateToReceipt", "receiptToRelease", "onTime", "reweighVariance", "exceptionRate"]) {
      expect(kpi(r, key).value).toBeNull();
      expect(kpi(r, key).notMeasured).not.toBe("");
      expect(kpi(r, key).measured).not.toBe("");
    }
    expect(kpi(r, "dockUtilisation").value).toBe(0);
    expect(r.throughput).toHaveLength(7);
    expect(r.period).toMatchObject({ days: 7, bucket: "day" });
  });

  it("dwell, gate-to-receipt and receipt-to-release use the stated points", () => {
    const a = mv({ gateIn: at("2026-10-01T08:00:00Z"), expReceipt: at("2026-10-01T12:00:00Z"), impRelease: at("2026-10-11T12:00:00Z") }); // 10 d
    const b = mv({ gateIn: at("2026-10-10T08:00:00Z"), expReceipt: at("2026-10-10T10:00:00Z"), leftAt: at("2026-10-12T10:00:00Z") }); // 2 d, left in container
    const c = mv({ visit: "výdej", receivedAt: at("2026-10-12T09:00:00Z"), gateIn: at("2026-10-14T07:00:00Z"), impRelease: at("2026-10-14T09:00:00Z") }); // 2 d
    const d = mv({ gateIn: at("2026-10-13T08:00:00Z"), impRelease: at("2026-10-13T10:00:00Z") }); // no receipt
    const r = buildKpiReport(
      empty({
        movements: [a, b, c, d],
        containers: [{ id: "c1", direction: "Unloading", equipment: "40' HC", cbm: null, pieces: null, dischargePort: "", gatedIn: "", gatedOut: "", gateInAt: at("2026-10-12T05:00:00Z"), gateOutAt: null }],
        houses: [{ movementId: c.id, containerId: "c1", addedBy: "u", stuffedAt: null, tickedAt: at("2026-10-12T09:00:00Z") }],
      }),
      P,
      NOW,
    );
    const dwell = kpi(r, "dwell");
    expect(dwell).toMatchObject({ value: 2, n: 3 });
    expect(dwell.notMeasured).toMatch(/1 left without a receipt/);
    expect(dwell.breakdown.find((p) => p.label === "P90")!.value).toBe(10);
    // b: 2 h at the gate; c: 4 h from its container's gate-in to the tally (outbound gate-in of the truck is ignored).
    expect(kpi(r, "gateToReceipt")).toMatchObject({ value: 3, n: 2 });
    // a (10 d) and c (2 d) were WH-released; b left in a container.
    expect(kpi(r, "receiptToRelease")).toMatchObject({ value: 6, n: 2 });
  });

  it("throughput counts received and left per Prague day, weekly beyond 31 days", () => {
    const m1 = mv({ colli: 10, weightKg: 1200, measureCbm: 3, expReceipt: at("2026-10-14T22:30:00Z") }); // Prague 15.10.
    const m2 = mv({ visit: "výdej", colli: 4, weightKg: 400, measureCbm: 1, loadInDate: "2026-10-09", impRelease: at("2026-10-15T08:00:00Z") });
    const r = buildKpiReport(empty({ movements: [m1, m2] }), P, NOW);
    expect(r.throughput.at(-1)).toMatchObject({ key: "2026-10-15", label: "15.10.", inPositions: 1, inPieces: 10, inKg: 1200, inCbm: 3, outPositions: 1, outPieces: 4 });
    expect(r.throughput[0]).toMatchObject({ key: "2026-10-09", inPositions: 1 });
    expect(kpi(r, "throughput")).toMatchObject({ value: 2 });
    const weekly = buildKpiReport(empty({ movements: [m1] }), { from: "2026-09-01", to: "2026-10-15" }, NOW);
    expect(weekly.period.bucket).toBe("week");
    expect(weekly.throughput.at(-1)).toMatchObject({ key: "2026-10-12", label: "W42", inPositions: 1 });
  });

  it("dock utilisation = booked minutes in opening hours / available dock minutes", () => {
    // 2026-10-12 is a Monday; one working day, 4 docks × 13 h = 3120 min.
    const slot = (dock: string, s: string, e: string, status = "Booked") => ({ movementId: null, dock, direction: "IN", status, startsAt: at(s), endsAt: at(e) });
    const r = buildKpiReport(
      empty({
        slots: [
          slot("Dock 1", "2026-10-12T06:00:00Z", "2026-10-12T08:00:00Z"), // 08:00–10:00 Prague, 120 min
          slot("Dock 2", "2026-10-12T03:00:00Z", "2026-10-12T05:00:00Z"), // 05:00–07:00, 60 min inside hours
          slot("Dock 3", "2026-10-12T08:00:00Z", "2026-10-12T09:00:00Z", "Cancelled"),
          slot("Ramp X", "2026-10-12T08:00:00Z", "2026-10-12T09:00:00Z"),
        ],
      }),
      { from: "2026-10-12", to: "2026-10-12" },
      NOW,
    );
    const k = kpi(r, "dockUtilisation");
    expect(k.value).toBe(round1((180 / 3120) * 100));
    expect(k.notMeasured).toMatch(/1 slot\(s\) on docks not in the list/);
    expect(k.breakdown.find((p) => p.label === "Dock 1")!.value).toBe(round1((120 / 780) * 100));
    expect(kpi(buildKpiReport(empty(), { from: "2026-10-17", to: "2026-10-18" }, NOW), "dockUtilisation")).toMatchObject({ value: null, notMeasured: "No working days in this period" });
  });

  it("on time compares arrival / release with the end of its dock slot", () => {
    const early = mv({ gateIn: at("2026-10-12T05:00:00Z") });
    const late = mv({ gateIn: at("2026-10-12T10:00:00Z") });
    const out = mv({ visit: "výdej", impRelease: at("2026-10-13T08:30:00Z") });
    const none = mv({ gateIn: at("2026-10-13T08:00:00Z") });
    const slot = (movementId: string, direction: string, s: string, e: string) => ({ movementId, dock: "Dock 1", direction, status: "Booked", startsAt: at(s), endsAt: at(e) });
    const r = buildKpiReport(
      empty({
        movements: [early, late, out, none],
        slots: [
          slot(early.id, "IN", "2026-10-12T06:00:00Z", "2026-10-12T07:00:00Z"),
          slot(late.id, "IN", "2026-10-12T06:00:00Z", "2026-10-12T07:00:00Z"),
          slot(out.id, "OUT", "2026-10-13T08:00:00Z", "2026-10-13T09:00:00Z"),
        ],
      }),
      P,
      NOW,
    );
    const k = kpi(r, "onTime");
    expect(k).toMatchObject({ value: round1((2 / 3) * 100), n: 3 });
    expect(k.notMeasured).toMatch(/1 without a dock slot/);
  });

  it("re-weigh variance: latest weighing per position, over 5 % of declared", () => {
    const r = buildKpiReport(
      empty({
        reweighs: [
          { movementId: "a", weighedKg: 1200, declaredKg: 1000, weighedAt: at("2026-10-10T08:00:00Z") },
          { movementId: "a", weighedKg: 1040, declaredKg: 1000, weighedAt: at("2026-10-11T08:00:00Z") }, // correction, within
          { movementId: "b", weighedKg: 900, declaredKg: 1000, weighedAt: at("2026-10-12T08:00:00Z") }, // −10 %
          { movementId: "c", weighedKg: 900, declaredKg: null, weighedAt: at("2026-10-12T08:00:00Z") },
          { movementId: "d", weighedKg: 2000, declaredKg: 1000, weighedAt: at("2026-09-01T08:00:00Z") }, // outside
        ],
      }),
      P,
      NOW,
    );
    const k = kpi(r, "reweighVariance");
    expect(k).toMatchObject({ value: 50, n: 2 });
    expect(k.notMeasured).toMatch(/1 weighed without a declared weight/);
  });

  it("exception rate per 100 positions received, by type", () => {
    const received = Array.from({ length: 4 }, () => mv({ expReceipt: at("2026-10-12T08:00:00Z") }));
    const r = buildKpiReport(
      empty({
        movements: received,
        exceptions: [
          { movementId: "x", type: "Damaged", pieces: 2, createdAt: at("2026-10-12T09:00:00Z") },
          { movementId: "x", type: "Short", pieces: 1, createdAt: at("2026-10-13T09:00:00Z") },
          { movementId: "x", type: "Over", pieces: 1, createdAt: at("2026-10-01T09:00:00Z") },
        ],
        shipmentUpdates: { pending: 2, failed: 1, oldestPendingAt: "2026-10-15T07:00:00Z" },
      }),
      P,
      NOW,
    );
    const k = kpi(r, "exceptionRate");
    expect(k).toMatchObject({ value: 50, n: 2 });
    expect(k.breakdown.find((p) => p.label === "Damaged")).toMatchObject({ value: 25, n: 1 });
    expect(k.breakdown.find((p) => p.label === "Damaged pieces")!.value).toBe(2);
    const o = kpi(r, "outboxHealth");
    expect(o).toMatchObject({ value: 3 });
    expect(o.breakdown.find((p) => p.label === "Oldest pending")!.value).toBe(3);
  });

  it("monthly summary and lane fill follow the receipt / left and container stamps", () => {
    const stuffed = mv({ measureCbm: 38, colli: 12, expReceipt: at("2026-10-02T08:00:00Z"), leftAt: at("2026-10-12T10:00:00Z") });
    const r = buildKpiReport(
      empty({
        movements: [stuffed, mv({ gateIn: at("2026-10-03T08:00:00Z") })],
        containers: [{ id: "e1", direction: "Loading", equipment: "40' HC", cbm: 70, pieces: 99, dischargePort: "Jebel Ali", gatedIn: "", gatedOut: "", gateInAt: at("2026-10-11T08:00:00Z"), gateOutAt: at("2026-10-12T10:00:00Z") }],
        houses: [{ movementId: stuffed.id, containerId: "e1", addedBy: "u", stuffedAt: at("2026-10-11T12:00:00Z"), tickedAt: null }],
      }),
      P,
      NOW,
    );
    expect(r.monthly[0]).toMatchObject({ month: "2026-10", monthToDate: true, receipts: 1, dispatches: 1, cbmOut: 38, containersLoaded: 1, yardContainerDays: 1 });
    expect(r.lanes).toEqual([{ lane: "Jebel Ali", containers: 1, avgCbm: 38, capacityCbm: 76, fill: 50, avgPieces: 12, verdict: "Below target" }]);
    expect(r.topCustomers).toEqual([]);
  });
});

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
