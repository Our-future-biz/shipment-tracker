import { describe, expect, it } from "vitest";
import type { BoxUtilizationRow } from "../interfaces/interfaces";
import { boxCostChanges, boxCostsOf, checkBoxCosts, shareCents, type BoxCostStored } from "../lib/coLoadingBoxCosts";
import { sailingEarnings, type ShipmentMoney } from "../lib/coLoadingEarnings";

const cost = (containerNo: number, kind: string, amount: number | null, currency = "EUR", note = ""): BoxCostStored => ({ containerNo, kind, amount, currency, note });
const RATES = new Map([
  ["EUR", 25],
  ["USD", 20],
]);

describe("checking a container's box costs", () => {
  it("gives every kind once, in order, a kind left out as not set", () => {
    const r = checkBoxCosts(1, 1, [{ kind: "ocean", amount: 2100, currency: "usd", note: " MSC " }]);
    expect(r).toEqual({
      lines: [
        { kind: "origin", amount: null, currency: "EUR", note: "" },
        { kind: "ocean", amount: 2100, currency: "USD", note: "MSC" },
        { kind: "destination", amount: null, currency: "EUR", note: "" },
      ],
    });
  });
  it("takes an amount of 0: a cost that is known to be nothing", () => {
    const r = checkBoxCosts(1, 1, [{ kind: "origin", amount: 0, currency: "EUR", note: "" }]);
    expect("lines" in r && r.lines[0]!.amount).toBe(0);
  });
  it("refuses a container the sailing does not have", () => {
    expect(checkBoxCosts(3, 2, [])).toEqual({ error: "This sailing has 2 containers: pick one of them." });
    expect(checkBoxCosts(0, 1, [])).toEqual({ error: "This sailing has one container." });
    expect(checkBoxCosts(1.5, 2, [])).toHaveProperty("error");
  });
  it("refuses a negative amount, a third decimal, a kind twice, an unknown kind, a bad currency and a long note", () => {
    const line = (more: object) => [{ kind: "ocean", amount: 1, currency: "EUR", note: "", ...more }];
    expect(checkBoxCosts(1, 1, line({ amount: -1 }))).toEqual({ error: "Ocean Freight: give an amount of 0 or more." });
    expect(checkBoxCosts(1, 1, line({ amount: 1.234 }))).toEqual({ error: "Ocean Freight: give the amount with at most two decimals." });
    expect(checkBoxCosts(1, 1, line({ amount: 1e9 }))).toEqual({ error: "Ocean Freight: the amount is too large." });
    expect(checkBoxCosts(1, 1, [...line({}), ...line({})])).toEqual({ error: "Ocean Freight is given twice." });
    expect(checkBoxCosts(1, 1, line({ kind: "fuel" }))).toEqual({ error: "A box cost is Origin Costs, Ocean Freight or Destination Costs." });
    expect(checkBoxCosts(1, 1, line({ currency: "EURO" }))).toEqual({ error: "Ocean Freight: pick a currency." });
    expect(checkBoxCosts(1, 1, line({ note: "x".repeat(201) }))).toEqual({ error: "Ocean Freight: keep the note to 200 characters." });
  });
});

describe("the record of changes", () => {
  const next = (amount: number | null, currency = "EUR", note = "") => [{ kind: "ocean", amount, currency, note }];
  it("has nothing for a cost never set and still not set", () => {
    expect(boxCostChanges([], next(null))).toEqual([]);
  });
  it("has a first figure, with nothing as the old one", () => {
    expect(boxCostChanges([], next(2100, "USD"))).toEqual([{ old: null, next: next(2100, "USD")[0] }]);
  });
  it("has a changed amount, currency or note, and nothing for the same again", () => {
    const stored = [cost(1, "ocean", 2100, "USD", "MSC")];
    expect(boxCostChanges(stored, next(2100, "USD", "MSC"))).toEqual([]);
    expect(boxCostChanges(stored, next(2200, "USD", "MSC"))).toHaveLength(1);
    expect(boxCostChanges(stored, next(2100, "EUR", "MSC"))).toHaveLength(1);
    expect(boxCostChanges(stored, next(2100, "USD", "Maersk"))).toHaveLength(1);
    expect(boxCostChanges(stored, next(null, "USD", "MSC"))).toHaveLength(1);
  });
  it("tells 0 from not set", () => {
    expect(boxCostChanges([cost(1, "ocean", null)], next(0))).toHaveLength(1);
  });
});

describe("a sailing's box costs", () => {
  it("are not set while no cost has an amount", () => {
    const b = boxCostsOf(1, [], null, null);
    expect(b.set).toBe(false);
    expect(b.containers).toHaveLength(1);
    expect(b.containers[0]!.lines.map((l) => l.kind)).toEqual(["origin", "ocean", "destination"]);
    expect(b.notSet).toEqual([]);
  });
  it("list each container's own costs and add them up, each at its currency's rate", () => {
    const b = boxCostsOf(2, [cost(1, "origin", 650), cost(1, "ocean", 2100, "USD"), cost(1, "destination", 10000, "CZK"), cost(2, "ocean", 2000, "USD")], RATES, "2026-11-23");
    expect(b.containers[0]!.total).toEqual({ czk: 68250, eur: 2730 });
    expect(b.containers[1]!.total).toEqual({ czk: 40000, eur: 1600 });
    expect(b.total).toEqual({ czk: 108250, eur: 4330 });
    expect(b.notSet).toEqual([
      { containerNo: 2, kind: "origin" },
      { containerNo: 2, kind: "destination" },
    ]);
    expect(b.rateDate).toBe("2026-11-23");
  });
  it("leave an amount with no rate out and name its currency", () => {
    const b = boxCostsOf(1, [cost(1, "origin", 100), cost(1, "ocean", 500, "CNY")], RATES, "2026-11-23");
    expect(b.total.czk).toBe(2500);
    expect(b.containers[0]!.lines[1]!.czk).toBeNull();
    expect(b.missingCurrencies).toEqual(["CNY"]);
  });
  it("value only CZK when the rates could not be read, with no EUR figure", () => {
    const b = boxCostsOf(1, [cost(1, "origin", 100), cost(1, "destination", 5000, "CZK")], null, null);
    expect(b.total).toEqual({ czk: 5000, eur: null });
    expect(b.missingCurrencies).toEqual(["EUR"]);
  });
  it("do not count costs kept for a container the sailing no longer has, and name it", () => {
    const b = boxCostsOf(1, [cost(1, "ocean", 100), cost(2, "ocean", 900)], RATES, "2026-11-23");
    expect(b.total.czk).toBe(2500);
    expect(b.ignoredContainers).toEqual([2]);
  });
});

describe("sharing an amount to the cent", () => {
  it("adds up to the amount, the cents left over going to the biggest remainders", () => {
    expect(shareCents(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(shareCents(374000, [11.2, 23.04, 6.1, 9.8, 4.75])!.reduce((a, b) => a + b, 0)).toBe(374000);
  });
  it("gives a weight of 0 nothing, and nothing at all when no weight is above 0", () => {
    expect(shareCents(1000, [0, 2, 2])).toEqual([0, 500, 500]);
    expect(shareCents(1000, [0, 0])).toBeNull();
    expect(shareCents(1000, [])).toBeNull();
  });
});

let n = 0;
const row = (freightTons: number, more: Partial<BoxUtilizationRow> = {}): BoxUtilizationRow => ({
  shipmentId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  jobNumber: `CZLCL${String(n).padStart(8, "0")}`,
  customer: "",
  status: "active",
  counted: true,
  colli: 1,
  weightKg: 0,
  volumeCbm: freightTons,
  freightTons,
  weightMissing: false,
  volumeMissing: false,
  weightSharePct: null,
  volumeSharePct: null,
  notStackable: false,
  dangerous: false,
  outOfGauge: false,
  temperatureControlled: false,
  odd: null,
  implausible: false,
  ...more,
});
const money = (shipmentId: string, sellingCzk: number, inlandCzk = 0): ShipmentMoney => ({
  shipmentId,
  sellingCzk,
  invoicedCzk: 0,
  inlandCzk,
  otherCzk: 0,
  ownBoxCzk: 0,
  masterJobCzk: 0,
  sellingLines: sellingCzk ? 1 : 0,
  untickedLines: 0,
  unrecognisedLines: 0,
  missingCurrencies: [],
  eurRate: 25,
});
const byId = (...items: ShipmentMoney[]) => new Map(items.map((m) => [m.shipmentId, m]));
const NONE = new Set<string>();
const box = (eur: number, containers = 1) => boxCostsOf(containers, [cost(1, "ocean", eur)], RATES, "2026-11-23");

describe("a sailing's profit", () => {
  it("shows none while no box cost is set", () => {
    const a = row(2);
    const e = sailingEarnings([a], byId(money(a.shipmentId, 25000)), NONE);
    expect(e.totals.boxCosts).toBeNull();
    expect(e.totals.profit).toBeNull();
    expect(e.totals.marginPct).toBeNull();
    expect(e.rows[0]!.boxShare).toBeNull();
    expect(e.rows[0]!.profit).toBeNull();
  });

  it("shares the box by W/M and gives each shipment its profit, the shares adding up to the box", () => {
    const a = row(3);
    const b = row(1);
    const e = sailingEarnings([a, b], byId(money(a.shipmentId, 50000, 5000), money(b.shipmentId, 25000)), NONE, box(1000));
    const [ra, rb] = [e.rows.find((r) => r.shipmentId === a.shipmentId)!, e.rows.find((r) => r.shipmentId === b.shipmentId)!];
    expect(ra.boxShare).toEqual({ czk: 18750, eur: 750 });
    expect(rb.boxShare).toEqual({ czk: 6250, eur: 250 });
    expect(ra.profit).toEqual({ czk: 26250, eur: 1050 });
    expect(rb.profit).toEqual({ czk: 18750, eur: 750 });
    expect(e.totals.boxCosts).toEqual({ czk: 25000, eur: 1000 });
    expect(e.totals.profit).toEqual({ czk: 45000, eur: 1800 });
    expect(e.totals.marginPct).toBe(60);
  });

  it("adds the shares up to the cent when they do not divide", () => {
    const rows = [row(1), row(1), row(1)];
    const e = sailingEarnings(rows, byId(...rows.map((r) => money(r.shipmentId, 10000))), NONE, box(100));
    expect(e.rows.reduce((s, r) => s + Math.round(r.boxShare!.eur! * 100), 0)).toBe(10000);
    expect(e.rows.reduce((s, r) => s + Math.round(r.boxShare!.czk * 100), 0)).toBe(250000);
  });

  it("lets the loaded shipments carry the whole box: a cancelled one carries none", () => {
    const a = row(2);
    const gone = row(2, { counted: false });
    const e = sailingEarnings([a, gone], byId(money(a.shipmentId, 50000), money(gone.shipmentId, 50000)), NONE, box(1000));
    expect(e.rows.find((r) => r.shipmentId === a.shipmentId)!.boxShare!.czk).toBe(25000);
    expect(e.rows.find((r) => r.shipmentId === gone.shipmentId)!.boxShare).toBeNull();
  });

  it("gives a shipment with no weight and no volume no share, and names it", () => {
    const a = row(2);
    const blank = row(0);
    const e = sailingEarnings([a, blank], byId(money(a.shipmentId, 50000), money(blank.shipmentId, 10000)), NONE, box(1000));
    const r = e.rows.find((x) => x.shipmentId === blank.shipmentId)!;
    expect(r.boxShare).toBeNull();
    expect(r.profit).toBeNull();
    expect(r.noShare).toBe(true);
    expect(e.notes.noShare).toBe(1);
    expect(e.totals.profit!.czk).toBe(35000);
  });

  it("shows the box costs unshared when no shipment has a W/M, the total still carrying them", () => {
    const blank = row(0);
    const e = sailingEarnings([blank], byId(money(blank.shipmentId, 50000)), NONE, box(1000));
    expect(e.boxUnshared).toBe(true);
    expect(e.rows[0]!.boxShare).toBeNull();
    expect(e.totals.profit!.czk).toBe(25000);
  });

  it("lets a shipment with no selling lines carry its share: a loss, marked", () => {
    const a = row(1);
    const e = sailingEarnings([a], byId(money(a.shipmentId, 0)), NONE, box(1000));
    expect(e.rows[0]!.profit).toEqual({ czk: -25000, eur: -1000 });
    expect(e.rows[0]!.noSelling).toBe(true);
    expect(e.totals.marginPct).toBeNull();
  });

  it("puts the shipment with the least profit first", () => {
    const a = row(1);
    const b = row(9);
    const e = sailingEarnings([a, b], byId(money(a.shipmentId, 10000), money(b.shipmentId, 12000)), NONE, box(1000));
    expect(e.rows[0]!.shipmentId).toBe(b.shipmentId);
  });

  it("is incomplete when a box cost has no rate", () => {
    const a = row(1);
    const e = sailingEarnings([a], byId(money(a.shipmentId, 10000)), NONE, boxCostsOf(1, [cost(1, "ocean", 500, "CNY"), cost(1, "origin", 1)], RATES, "2026-11-23"));
    expect(e.complete).toBe(false);
  });
});
