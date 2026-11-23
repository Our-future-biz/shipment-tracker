import { describe, expect, it } from "vitest";
import type { BoxUtilizationRow } from "../interfaces/interfaces";
import { boxCostChanges, boxCostsChangedBy, boxCostsOf, checkBoxCosts, sailingDetailChanges, shareCents, type BoxCostStored } from "../lib/coLoadingBoxCosts";
import { profitProvisional, sailingEarnings, sailingProfit, type ShipmentMoney } from "../lib/coLoadingEarnings";

const cost = (containerNo: number, kind: string, amount: number | null, currency = "EUR", note = ""): BoxCostStored => ({ containerNo, kind, amount, currency, note });
const RATES = {
  rates: new Map([
    ["EUR", 25],
    ["USD", 20],
  ]),
  fixingDate: "2026-11-23",
  provisional: false,
};

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
    const b = boxCostsOf(1, [], null);
    expect(b.set).toBe(false);
    expect(b.containers).toHaveLength(1);
    expect(b.containers[0]!.lines.map((l) => l.kind)).toEqual(["origin", "ocean", "destination"]);
    expect(b.notSet).toEqual([]);
  });
  it("list each container's own costs and add them up, each at its currency's rate", () => {
    const b = boxCostsOf(2, [cost(1, "origin", 650), cost(1, "ocean", 2100, "USD"), cost(1, "destination", 10000, "CZK"), cost(2, "ocean", 2000, "USD")], RATES);
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
    const b = boxCostsOf(1, [cost(1, "origin", 100), cost(1, "ocean", 500, "CNY")], RATES);
    expect(b.total.czk).toBe(2500);
    expect(b.containers[0]!.lines[1]!.czk).toBeNull();
    expect(b.missingCurrencies).toEqual(["CNY"]);
  });
  it("value only CZK when the rates could not be read, with no EUR figure", () => {
    const b = boxCostsOf(1, [cost(1, "origin", 100), cost(1, "destination", 5000, "CZK")], null);
    expect(b.total).toEqual({ czk: 5000, eur: null });
    expect(b.missingCurrencies).toEqual(["EUR"]);
  });
  it("do not count costs kept for a container the sailing no longer has, and name it", () => {
    const b = boxCostsOf(1, [cost(1, "ocean", 100), cost(2, "ocean", 900)], RATES);
    expect(b.total.czk).toBe(2500);
    expect(b.ignoredContainers).toEqual([2]);
  });
});

describe("the day whose rates value the box costs", () => {
  const costs = [cost(1, "ocean", 100)];
  it("is provisional while the sailing has no departure date: the latest rates are used", () => {
    const b = boxCostsOf(1, costs, RATES);
    expect(b).toMatchObject({ departureDate: null, rateDate: "2026-11-23", rateProvisional: true });
  });
  it("is fixed once the departure date's fixing is out", () => {
    const b = boxCostsOf(1, costs, { ...RATES, fixingDate: "2026-11-20" }, "2026-11-21");
    expect(b).toMatchObject({ departureDate: "2026-11-21", rateDate: "2026-11-20", rateProvisional: false });
  });
  it("is provisional while the departure date is still ahead", () => {
    expect(boxCostsOf(1, costs, { ...RATES, provisional: true }, "2026-12-20").rateProvisional).toBe(true);
  });
  it("is provisional when the rates could not be read", () => {
    expect(boxCostsOf(1, costs, null, "2026-11-21")).toMatchObject({ rateDate: null, rateProvisional: true });
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
const box = (eur: number, containers = 1) => boxCostsOf(containers, [cost(1, "ocean", eur)], RATES);

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
    const e = sailingEarnings([a], byId(money(a.shipmentId, 10000)), NONE, boxCostsOf(1, [cost(1, "ocean", 500, "CNY"), cost(1, "origin", 1)], RATES));
    expect(e.complete).toBe(false);
  });
});

describe("break-even and the unsold space", () => {
  it("are not shown while no box cost is set", () => {
    const a = row(2);
    const e = sailingEarnings([a], byId(money(a.shipmentId, 25000)), NONE, undefined, 60);
    expect(e.breakEven).toBeNull();
    expect(e.unsold).toBeNull();
  });
  it("give the W/M that covers the box at what the loaded shipments earn per W/M", () => {
    // 4 W/M earn 75,000 before the box: 18,750 per W/M. A box of 25,000 is covered at 1.3 W/M.
    const a = row(3);
    const b = row(1);
    const e = sailingEarnings([a, b], byId(money(a.shipmentId, 50000), money(b.shipmentId, 25000)), NONE, box(1000), 60);
    expect(e.breakEven).toEqual({ wm: 1.3, loadedWm: 4, ofLoaded: 0.333, reached: true, boxPct: 20 });
  });
  it("say it is not reached when the box costs more than the shipments earn", () => {
    const a = row(2);
    const e = sailingEarnings([a], byId(money(a.shipmentId, 12500)), NONE, box(1000), 60);
    // Twice today's load in a box 60% full: 120% of the box, more than it takes.
    expect(e.breakEven).toEqual({ wm: 4, loadedWm: 2, ofLoaded: 2, reached: false, boxPct: 120 });
  });
  it("give no break-even when the shipments earn nothing before the box", () => {
    const a = row(2);
    const e = sailingEarnings([a], byId(money(a.shipmentId, 10000, 10000)), NONE, box(1000), 60);
    expect(e.breakEven).toEqual({ wm: null, loadedWm: 2, ofLoaded: null, reached: false, boxPct: null });
  });
  it("wait until every loaded shipment is priced, and say how many are not", () => {
    const a = row(3);
    const unpriced = row(1);
    const cancelled = row(1, { counted: false });
    const e = sailingEarnings([a, unpriced, cancelled], byId(money(a.shipmentId, 50000), money(unpriced.shipmentId, 0), money(cancelled.shipmentId, 0)), NONE, box(1000), 60);
    expect(e.breakEven).toBeNull();
    expect(e.breakEvenWaitsFor).toBe(1);
    // A shipment whose money could not be read is not priced either.
    expect(sailingEarnings([a, unpriced], byId(money(a.shipmentId, 50000)), NONE, box(1000), 60).breakEvenWaitsFor).toBe(1);
    // Nothing waits while no box cost is set: there is no break-even to wait for.
    expect(sailingEarnings([a, unpriced], byId(money(a.shipmentId, 50000), money(unpriced.shipmentId, 0)), NONE).breakEvenWaitsFor).toBe(0);
  });
  it("cost the unsold space as its share of the box costs", () => {
    const a = row(2);
    const e = sailingEarnings([a], byId(money(a.shipmentId, 50000)), NONE, box(1000), 74);
    expect(e.unsold).toEqual({ pct: 26, cost: { czk: 6500, eur: 260 } });
  });
  it("have no unsold space in a full or overfull box, and none known without a capacity", () => {
    const a = row(2);
    const m = byId(money(a.shipmentId, 50000));
    expect(sailingEarnings([a], m, NONE, box(1000), 108).unsold).toEqual({ pct: 0, cost: { czk: 0, eur: 0 } });
    expect(sailingEarnings([a], m, NONE, box(1000), null).unsold).toBeNull();
  });
});

describe("a sailing's profit at a glance", () => {
  it("is its profit and margin, marked provisional while a foreign-currency box cost has no fixed rate", () => {
    const a = row(2);
    const e = sailingEarnings([a], byId(money(a.shipmentId, 50000)), NONE, boxCostsOf(1, [cost(1, "ocean", 1000)], RATES, "2026-11-20"));
    expect(sailingProfit("s1", e)).toEqual({
      sailingId: "s1",
      moneyKnown: true,
      boxCostsSet: true,
      profit: { czk: 25000, eur: 1000 },
      marginPct: 50,
      complete: true,
      boxCostsComplete: false,
      revenueComplete: true,
      provisional: false,
    });
    expect(profitProvisional(sailingEarnings([a], byId(money(a.shipmentId, 50000)), NONE, box(1000)))).toBe(true);
    expect(profitProvisional(sailingEarnings([a], byId(money(a.shipmentId, 50000)), NONE, boxCostsOf(1, [cost(1, "ocean", 1000, "CZK")], RATES)))).toBe(false);
  });
  it("has no profit while no box cost is set, or when the money could not be read", () => {
    const a = row(2);
    expect(sailingProfit("s1", sailingEarnings([a], byId(money(a.shipmentId, 50000)), NONE)).profit).toBeNull();
    expect(sailingProfit("s1", sailingEarnings([a], null, NONE, box(1000))).profit).toBeNull();
  });
});

describe("the figure that decides profit or loss", () => {
  // The shipment at its own rate 25.20, the box at the departure day's 24.90: EUR and CZK disagree.
  const a = row(2);
  const m = new Map([[a.shipmentId, { ...money(a.shipmentId, 50400), eurRate: 25.2 }]]);
  const e = sailingEarnings([a], m, NONE, boxCostsOf(1, [cost(1, "ocean", 2010)], { rates: new Map([["EUR", 24.9]]), fixingDate: "2026-11-20", provisional: false }, "2026-11-20"));
  it("is the EUR one: a loss in EUR is a negative margin and a break-even not reached, though the CZK is above zero", () => {
    expect(e.totals.profit).toEqual({ czk: 351, eur: -10 });
    expect(e.totals.marginPct).toBe(-0.5);
    expect(e.breakEven!.reached).toBe(false);
    expect(e.breakEven!.ofLoaded).toBe(1.005);
  });
  it("is the CZK one where no EUR rate is known", () => {
    const noEur = new Map([[a.shipmentId, { ...money(a.shipmentId, 50400), eurRate: null }]]);
    const f = sailingEarnings([a], noEur, NONE, boxCostsOf(1, [cost(1, "ocean", 50049, "CZK")], null));
    expect(f.totals.profit).toEqual({ czk: 351, eur: null });
    expect(f.totals.marginPct).toBe(0.7);
    expect(f.breakEven!.reached).toBe(true);
  });
});

describe("what makes a profit at a glance less than final", () => {
  const a = row(2);
  const all = [cost(1, "origin", 0), cost(1, "ocean", 1000), cost(1, "destination", 0)];
  it("is complete when every cost of every container is set and every shipment is priced", () => {
    expect(sailingProfit("s", sailingEarnings([a], byId(money(a.shipmentId, 50000)), NONE, boxCostsOf(1, all, RATES, "2026-11-20")))).toMatchObject({ boxCostsComplete: true, revenueComplete: true });
  });
  it("says the box costs are not complete while one is not set, or costs are kept for a container that is gone", () => {
    expect(sailingProfit("s", sailingEarnings([a], byId(money(a.shipmentId, 50000)), NONE, box(1000))).boxCostsComplete).toBe(false);
    const gone = boxCostsOf(1, [...all, cost(2, "ocean", 900)], RATES, "2026-11-20");
    expect(sailingProfit("s", sailingEarnings([a], byId(money(a.shipmentId, 50000)), NONE, gone)).boxCostsComplete).toBe(false);
  });
  it("says the revenue is not complete while a loaded shipment has no selling lines", () => {
    expect(sailingProfit("s", sailingEarnings([a], byId(money(a.shipmentId, 0)), NONE, boxCostsOf(1, all, RATES, "2026-11-20"))).revenueComplete).toBe(false);
  });
  it("says the money is not known when it could not be read, and that no box cost is set", () => {
    expect(sailingProfit("s", sailingEarnings([a], null, NONE, box(1000)))).toMatchObject({ moneyKnown: false, profit: null });
    expect(sailingProfit("s", sailingEarnings([a], byId(money(a.shipmentId, 50000)), NONE))).toMatchObject({ boxCostsSet: false, profit: null });
  });
});

describe("cargo figures a share cannot be trusted on", () => {
  it("marks a shipment with its weight or its volume missing, and one whose figures cannot be right", () => {
    const noVolume = row(0.8, { volumeMissing: true });
    const noWeight = row(4, { weightMissing: true });
    const wrong = row(1500, { implausible: true });
    const neither = row(0, { weightMissing: true, volumeMissing: true });
    const fine = row(2);
    const all = [noVolume, noWeight, wrong, neither, fine];
    const e = sailingEarnings(all, byId(...all.map((r) => money(r.shipmentId, 10000))), NONE, box(1000));
    const of = (r: BoxUtilizationRow) => e.rows.find((x) => x.shipmentId === r.shipmentId)!;
    expect(of(noVolume).cargoGap).toBe("volume");
    expect(of(noWeight).cargoGap).toBe("weight");
    expect(of(wrong).cargoImplausible).toBe(true);
    // Neither figure: no share at all, said by its own mark.
    expect(of(neither)).toMatchObject({ cargoGap: null, noShare: true });
    expect(of(fine)).toMatchObject({ cargoGap: null, cargoImplausible: false });
    expect(e.notes).toMatchObject({ cargoGap: 2, cargoImplausible: 1, noShare: 1 });
  });
  it("marks a shipment the box is not for, and one with road freight typed by hand", () => {
    const air = row(2, { odd: "Air Freight" });
    const road = row(2);
    const e = sailingEarnings([air, road], new Map([[air.shipmentId, money(air.shipmentId, 10000)], [road.shipmentId, { ...money(road.shipmentId, 10000), handRoadLines: 2 }]]), NONE, box(1000));
    expect(e.rows.find((r) => r.shipmentId === air.shipmentId)!.odd).toBe("Air Freight");
    expect(e.rows.find((r) => r.shipmentId === road.shipmentId)!.handRoadLines).toBe(2);
    expect(e.notes).toMatchObject({ odd: 1, handRoad: 1 });
  });
});

describe("a save over costs changed meanwhile", () => {
  const shown = [
    { kind: "origin", amount: null, currency: "EUR", note: "" },
    { kind: "ocean", amount: 1000, currency: "EUR", note: "MSC" },
    { kind: "destination", amount: null, currency: "EUR", note: "" },
  ];
  const stored = (amount: number | null, currency = "EUR", note = "MSC") => [{ kind: "ocean", amount, currency, note, updatedByName: "Jana Nová" }];
  it("goes on when the costs are as the dialog showed them", () => {
    expect(boxCostsChangedBy(stored(1000), shown)).toBeNull();
    // A cost not set has no currency that counts, and a kind with no row is not set.
    expect(boxCostsChangedBy([...stored(1000), { kind: "origin", amount: null, currency: "USD", note: "" }], shown)).toBeNull();
    expect(boxCostsChangedBy([], [])).toBeNull();
  });
  it("is refused, naming who changed them, when an amount, a currency or a note differs", () => {
    expect(boxCostsChangedBy(stored(1500), shown)).toBe("Jana Nová");
    expect(boxCostsChangedBy(stored(1000, "USD"), shown)).toBe("Jana Nová");
    expect(boxCostsChangedBy(stored(1000, "EUR", "Maersk"), shown)).toBe("Jana Nová");
    expect(boxCostsChangedBy(stored(null), shown)).toBe("Jana Nová");
  });
  it("is refused when a cost was set that the dialog showed as not set, or the other way round", () => {
    expect(boxCostsChangedBy([...stored(1000), { kind: "origin", amount: 300, currency: "EUR", note: "" }], shown)).toBe("");
    expect(boxCostsChangedBy([], shown)).toBe("");
  });
});

describe("changes of the sailing that move its box costs", () => {
  const before = { containerCount: 2, departureDate: "2026-11-20" };
  it("are none when neither the number of containers nor the departure date changed", () => {
    expect(sailingDetailChanges(before, { containerCount: 2, departureDate: "2026-11-20" })).toEqual([]);
    // A departure date left out stays as it is.
    expect(sailingDetailChanges(before, { containerCount: 2 })).toEqual([]);
  });
  it("record the old and the new number of containers, and the old and the new date", () => {
    expect(sailingDetailChanges(before, { containerCount: 1, departureDate: null })).toEqual([
      { kind: "containers", oldAmount: 2, newAmount: 1, oldNote: "", newNote: "" },
      { kind: "departure", oldAmount: null, newAmount: null, oldNote: "2026-11-20", newNote: "" },
    ]);
    expect(sailingDetailChanges({ containerCount: 1, departureDate: null }, { containerCount: 1, departureDate: "2026-12-01" })).toEqual([
      { kind: "departure", oldAmount: null, newAmount: null, oldNote: "", newNote: "2026-12-01" },
    ]);
  });
});
