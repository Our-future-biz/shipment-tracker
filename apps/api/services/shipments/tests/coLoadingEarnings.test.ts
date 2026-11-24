import { describe, expect, it } from "vitest";
import type { BoxUtilizationRow } from "../interfaces/interfaces";
import { sailingEarnings, type ShipmentMoney } from "../lib/coLoadingEarnings";

let n = 0;
const row = (more: Partial<BoxUtilizationRow> = {}): BoxUtilizationRow => ({
  shipmentId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  jobNumber: `CZLCL${String(n).padStart(8, "0")}`,
  customer: "Alfa s.r.o.",
  status: "active",
  counted: true,
  colli: 1,
  weightKg: 1000,
  volumeCbm: 2,
  freightTons: 2,
  weightMissing: false,
  volumeMissing: false,
  weightSharePct: null,
  volumeSharePct: null,
  notStackable: false,
  dangerous: false, adr: [],
  outOfGauge: false,
  temperatureControlled: false,
  odd: null,
  implausible: false,
  ...more,
});
const money = (shipmentId: string, more: Partial<ShipmentMoney> = {}): ShipmentMoney => ({
  shipmentId,
  sellingCzk: 0,
  invoicedCzk: 0,
  inlandCzk: 0,
  otherCzk: 0,
  ownBoxCzk: 0,
  masterJobCzk: 0,
  sellingLines: 1,
  untickedLines: 0,
  unrecognisedLines: 0,
  missingCurrencies: [],
  eurRate: 25,
  ...more,
});
const byId = (...items: ShipmentMoney[]) => new Map(items.map((m) => [m.shipmentId, m]));
const NONE = new Set<string>();

describe("a sailing's earnings", () => {
  it("gives each shipment its selling less its inland delivery and other costs, in CZK and in EUR at its own rate", () => {
    const a = row();
    const e = sailingEarnings([a], byId(money(a.shipmentId, { sellingCzk: 25000, invoicedCzk: 10000, inlandCzk: 5000, otherCzk: 2500 })), NONE);
    expect(e.rows[0].selling).toEqual({ czk: 25000, eur: 1000 });
    expect(e.rows[0].invoiced).toEqual({ czk: 10000, eur: 400 });
    expect(e.rows[0].beforeBox).toEqual({ czk: 17500, eur: 700 });
    expect(e.totals.beforeBox).toEqual({ czk: 17500, eur: 700 });
    expect(e.complete).toBe(true);
  });

  it("adds the EUR of each shipment at its own rate, not the CZK total at one rate", () => {
    const a = row();
    const b = row();
    const e = sailingEarnings([a, b], byId(money(a.shipmentId, { sellingCzk: 25000, eurRate: 25 }), money(b.shipmentId, { sellingCzk: 24000, eurRate: 24 })), NONE);
    expect(e.totals.selling).toEqual({ czk: 49000, eur: 2000 });
  });

  it("keeps a shipment's own freight lines and a master job's shares out of what it earns, and says so", () => {
    const a = row();
    const e = sailingEarnings([a], byId(money(a.shipmentId, { sellingCzk: 25000, ownBoxCzk: 12500, masterJobCzk: 5000 })), NONE);
    expect(e.rows[0].beforeBox.czk).toBe(25000);
    expect(e.rows[0].ownBox.czk).toBe(12500);
    expect(e.rows[0].inMasterJob).toBe(true);
    expect(e.notes).toMatchObject({ ownBox: 1, inMasterJob: 1 });
  });

  it("marks a shipment a master job holds even before any cost is shared into it", () => {
    const a = row();
    const e = sailingEarnings([a], byId(money(a.shipmentId)), new Set([a.shipmentId]));
    expect(e.rows[0].inMasterJob).toBe(true);
  });

  it("lists a cancelled shipment without counting it, and shows what it sells for apart", () => {
    const a = row();
    const gone = row({ counted: false, status: "cancelled" });
    const e = sailingEarnings([gone, a], byId(money(a.shipmentId, { sellingCzk: 25000 }), money(gone.shipmentId, { sellingCzk: 50000 })), NONE);
    expect(e.totals.shipments).toBe(1);
    expect(e.totals.selling.czk).toBe(25000);
    expect(e.notCounted).toBe(1);
    expect(e.notCountedSelling.czk).toBe(50000);
    expect(e.notCountedCosts.czk).toBe(0);
    expect(e.rows.at(-1)!.shipmentId).toBe(gone.shipmentId);
  });

  it("counts the remarks: nothing sold, lines not ticked, a line it could not place, a currency with no rate", () => {
    const a = row();
    const b = row();
    const e = sailingEarnings(
      [a, b],
      byId(money(a.shipmentId, { sellingLines: 0 }), money(b.shipmentId, { sellingCzk: 1000, untickedLines: 2, unrecognisedLines: 1, missingCurrencies: ["USD"] })),
      NONE,
    );
    expect(e.notes).toMatchObject({ noSelling: 1, unticked: 1, unrecognised: 1, missingCurrencies: ["USD"] });
    expect(e.complete).toBe(false);
  });

  it("puts the shipment that earns least first", () => {
    const a = row();
    const b = row();
    const e = sailingEarnings([a, b], byId(money(a.shipmentId, { sellingCzk: 5000 }), money(b.shipmentId, { sellingCzk: 1000, inlandCzk: 3000 })), NONE);
    expect(e.rows.map((r) => r.shipmentId)).toEqual([b.shipmentId, a.shipmentId]);
  });

  it("gives no EUR figure without a rate, for the shipment and for the total", () => {
    const a = row();
    const e = sailingEarnings([a], byId(money(a.shipmentId, { sellingCzk: 25000, eurRate: null })), NONE);
    expect(e.rows[0].selling).toEqual({ czk: 25000, eur: null });
    expect(e.totals.selling.eur).toBeNull();
    expect(e.totals.inland).toEqual({ czk: 0, eur: 0 });
  });

  it("says the money is not known when it could not be read: never 0 as a fact", () => {
    const a = row();
    const all = sailingEarnings([a], null, NONE);
    expect(all.moneyKnown).toBe(false);
    expect(all.complete).toBe(false);
    expect(all.rows[0].moneyKnown).toBe(false);
    expect(all.rows[0].noSelling).toBe(false);
    const one = sailingEarnings([a], byId(), NONE);
    expect(one.moneyKnown).toBe(true);
    expect(one.rows[0].moneyKnown).toBe(false);
    expect(one.complete).toBe(false);
  });

  it("is empty for a sailing with no shipments", () => {
    const e = sailingEarnings([], byId(), NONE);
    expect(e.rows).toEqual([]);
    expect(e.totals.selling).toEqual({ czk: 0, eur: 0 });
    expect(e.complete).toBe(true);
  });
});

describe("a cancelled shipment's own costs", () => {
  it("are shown apart, like its selling: a failed collection does not vanish from the sailing", () => {
    const gone = row({ counted: false, status: "cancelled" });
    const e = sailingEarnings([gone], byId(money(gone.shipmentId, { sellingCzk: 2500, inlandCzk: 4500, otherCzk: 500 })), NONE);
    expect(e.notCountedCosts).toEqual({ czk: 5000, eur: 200 });
    expect(e.totals.inland.czk).toBe(0);
  });
});
