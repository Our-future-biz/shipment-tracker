import { describe, expect, it } from "vitest";
import type { BoxUtilization } from "./boxUtilization";
import type { SailingEarnings } from "./earnings";
import { boxCurrency, boxPerWmOf, earnedPerWm, freeWmOf, sellRestOf, sellRestWords, whatIfOf } from "./sellRest";

const eur = (v: number) => ({ czk: v * 25, eur: v });
const meter = (used: number, limit: number) => ({ used, limit, max: limit * 1.1, pct: Math.floor((used / limit) * 100), free: Math.round((limit - used) * 1000) / 1000, state: "room" as const });
const box = (usedCbm: number, usedKg: number) => ({ volume: meter(usedCbm, 64.9), weight: meter(usedKg, 26200) }) as unknown as BoxUtilization;
// 20 W/M loaded, selling 4,000, earning 3,000 before the box; the box costs 4,500.
const earnings = (more: { beforeBox?: number; boxCosts?: number | null; selling?: number; wm?: number; breakEven?: boolean } = {}): SailingEarnings => {
  const loadedWm = more.wm ?? 20;
  const boxCosts = more.boxCosts === undefined ? 4500 : more.boxCosts;
  const beforeBox = more.beforeBox ?? 3000;
  return {
    totals: { freightTons: loadedWm, selling: eur(more.selling ?? 4000), beforeBox: eur(beforeBox), boxCosts: boxCosts === null ? null : eur(boxCosts), profit: boxCosts === null ? null : eur(beforeBox - boxCosts) },
    breakEven: more.breakEven === false ? null : { wm: 30, loadedWm, ofLoaded: 1.5, reached: false, boxPct: 46 },
  } as unknown as SailingEarnings;
};

describe("the room left in a box, in W/M", () => {
  it("scales today's W/M by the meter that fills first", () => {
    // 20 cbm of 64.9 → 2.245 times more; 13,100 kg of 26,200 → once more: weight fills first.
    expect(freeWmOf(box(20, 13100), 20)).toEqual({ wm: 20, limitedBy: "weight" });
    expect(freeWmOf(box(32.45, 2620), 20)).toEqual({ wm: 20, limitedBy: "volume" });
  });

  it("is none with nothing loaded, and nothing in a full or overfull box", () => {
    expect(freeWmOf(box(0, 0), 0)).toBeNull();
    expect(freeWmOf(box(70, 5000), 20)).toEqual({ wm: 0, limitedBy: "volume" });
  });
});

describe("Sell the rest at (Council Outlay 14, B1)", () => {
  it("gives the rate that covers the box, and the rates for 10, 15 and 20% margin", () => {
    const s = sellRestOf(earnings(), box(20, 13100))!;
    // 1,500 short over 20 free W/M.
    expect(s).toMatchObject({ currency: "EUR", freeWm: 20, limitedBy: "weight", shortfall: 1500, breakEvenRate: 75, earnedPerWm: 150, boxPerWm: 225 });
    // kept = 0.75; 10%: (1500 + 400) / (20 × (1 − 0.1/0.75)) = 109.62
    expect(s.margins).toEqual([
      { pct: 10, rate: 109.62 },
      { pct: 15, rate: 131.25 },
      { pct: 20, rate: 156.82 },
    ]);
  });

  it("checks out: at the 15% rate the sailing's margin is 15%", () => {
    const s = sellRestOf(earnings(), box(20, 13100))!;
    const rate = s.margins[1]!.rate!;
    const profit = 3000 + rate * 20 - 4500;
    const revenue = 4000 + (rate * 20) / 0.75;
    expect(Math.round((profit / revenue) * 1000) / 10).toBe(15);
  });

  it("says the box is paid for once break-even is reached", () => {
    const s = sellRestOf(earnings({ beforeBox: 5000, selling: 6000 }), box(20, 13100))!;
    expect(s).toMatchObject({ shortfall: -500, breakEvenRate: 0 });
    expect(sellRestWords(s)[0]).toBe("Room for about 20 W/M more with the same mix of cargo (weight fills first). The box is paid for: whatever the rest earns before the box is profit.");
  });

  it("says a margin is reached already where today's cargo brings it", () => {
    // Profit 500 on 6,000 revenue is 8.3%; with 5,300 earned it is 800 = 13.3%: 10% needs nothing more.
    const s = sellRestOf(earnings({ beforeBox: 5300, selling: 6000 }), box(20, 13100))!;
    expect(s.margins[0]).toEqual({ pct: 10, rate: 0 });
    expect(sellRestWords(s)[1]).toMatch(/^For a margin of 10%: reached already · 15%: \d+\.\d\d EUR per W\/M · 20%: /);
  });

  it("gives no margin rate the cargo's own costs cannot leave, and none with no room", () => {
    // Only 12% of the revenue is left before the box: 15 and 20% cannot be reached at any rate.
    expect(sellRestOf(earnings({ beforeBox: 480, selling: 4000 }), box(20, 13100))!.margins.map((m) => m.rate !== null)).toEqual([true, false, false]);
    const full = sellRestOf(earnings(), box(70, 5000))!;
    expect(full).toMatchObject({ freeWm: 0, breakEvenRate: null });
    expect(sellRestWords(full)).toEqual(["No room left to sell: the box is full by volume, and 1,500.00 EUR of its costs are not covered."]);
  });

  it("is not worked out where the break-even is not: no box costs, an unpriced shipment, no box", () => {
    expect(sellRestOf(earnings({ boxCosts: null }), box(20, 13100))).toBeNull();
    expect(sellRestOf(earnings({ breakEven: false }), box(20, 13100))).toBeNull();
    expect(sellRestOf(earnings(), null)).toBeNull();
  });

  it("says it in sentences", () => {
    expect(sellRestWords(sellRestOf(earnings(), box(20, 13100))!)).toEqual([
      "Room for about 20 W/M more with the same mix of cargo (weight fills first). To break even the rest must earn at least 75.00 EUR per W/M before the box.",
      "For a margin of 10%: 109.62 EUR per W/M · 15%: 131.25 EUR per W/M · 20%: 156.82 EUR per W/M.",
      "Today's cargo earns 150.00 EUR per W/M; the box costs 225.00 EUR per loaded W/M.",
    ]);
  });

  it("never prints a minus zero", () => {
    const words = sellRestWords({ currency: "EUR", freeWm: 10, limitedBy: "volume", shortfall: 100, breakEvenRate: 10, margins: [], earnedPerWm: -0.001, boxPerWm: 10 });
    expect(words.at(-1)).toBe("Today's cargo earns 0.00 EUR per W/M; the box costs 10.00 EUR per loaded W/M.");
  });
});

describe("earned per W/M (B2)", () => {
  it("is a shipment's earning before the box over its W/M, in the currency asked for", () => {
    expect(earnedPerWm({ counted: true, moneyKnown: true, freightTons: 9.08, beforeBox: eur(484) }, "EUR")).toEqual({ value: 53.3, currency: "EUR" });
    expect(earnedPerWm({ counted: true, moneyKnown: true, freightTons: 9.08, beforeBox: eur(484) }, "CZK")).toEqual({ value: 1332.6, currency: "CZK" });
    expect(earnedPerWm({ counted: true, moneyKnown: true, freightTons: 2, beforeBox: { czk: 5000, eur: null } }, "CZK")).toEqual({ value: 2500, currency: "CZK" });
    // Never another currency than the one asked for: a row with no EUR value has no EUR figure.
    expect(earnedPerWm({ counted: true, moneyKnown: true, freightTons: 2, beforeBox: { czk: 5000, eur: null } }, "EUR")).toBeNull();
  });

  it("is not said for a cancelled shipment, one with no W/M, or one whose money is not known", () => {
    expect(earnedPerWm({ counted: false, moneyKnown: true, freightTons: 2, beforeBox: eur(100) }, "EUR")).toBeNull();
    expect(earnedPerWm({ counted: true, moneyKnown: true, freightTons: 0, beforeBox: eur(100) }, "EUR")).toBeNull();
    expect(earnedPerWm({ counted: true, moneyKnown: false, freightTons: 2, beforeBox: eur(0) }, "EUR")).toBeNull();
  });
});

describe("the box's one currency and its cost per W/M", () => {
  // The earning before the box has an EUR value, the box costs none (the rates could not be read).
  const mixed = { freightTons: 20, beforeBox: { czk: 75000, eur: 3000 }, boxCosts: { czk: 112500, eur: null } };

  it("is EUR only where the earning before the box and the box costs both have it", () => {
    expect(boxCurrency({ beforeBox: eur(3000), boxCosts: eur(4500) })).toBe("EUR");
    expect(boxCurrency(mixed)).toBe("CZK");
    expect(boxCurrency({ beforeBox: { czk: 75000, eur: null }, boxCosts: eur(4500) })).toBe("CZK");
    expect(boxCurrency({ beforeBox: eur(3000), boxCosts: null })).toBe("EUR");
  });

  it("gives the box's cost per loaded W/M in that currency, never CZK set beside EUR rows", () => {
    expect(boxPerWmOf({ freightTons: 20, beforeBox: eur(3000), boxCosts: eur(4500) })).toEqual({ value: 225, currency: "EUR" });
    expect(boxPerWmOf(mixed)).toEqual({ value: 5625, currency: "CZK" });
    expect(boxPerWmOf({ ...mixed, boxCosts: null })).toBeNull();
    expect(boxPerWmOf({ ...mixed, freightTons: 0 })).toBeNull();
  });
});

describe("What if I add this (B3)", () => {
  it("shows the box and the money with one more shipment", () => {
    // 5 cbm, 1,000 kg at 100 per W/M: 5 W/M, earns 500; of the 4,500 box it would carry 5/25 = 900.
    expect(whatIfOf(earnings(), box(20, 13100), { cbm: 5, kg: 1000, rate: 100 })).toEqual({
      currency: "EUR",
      wm: 5,
      volumePct: 39,
      weightPct: 54,
      over: false,
      earns: 500,
      share: 900,
      after: -400,
      profitNow: -1500,
      profitThen: -1000,
      othersRelief: 900,
    });
  });

  it("takes the tonnes where they are more than the cbm, and says when the box would be over", () => {
    expect(whatIfOf(earnings(), box(20, 13100), { cbm: 2, kg: 14000, rate: 50 })).toMatchObject({ wm: 14, weightPct: 103, over: true, earns: 700 });
  });

  it("works in CZK, as the card asks for the rate, when the box costs have no EUR value", () => {
    const e = {
      totals: { freightTons: 20, selling: { czk: 100000, eur: 4000 }, beforeBox: { czk: 75000, eur: 3000 }, boxCosts: { czk: 112500, eur: null }, profit: { czk: -37500, eur: null } },
      breakEven: null,
    } as unknown as SailingEarnings;
    const r = whatIfOf(e, box(20, 13100), { cbm: 5, kg: 1000, rate: 2500 })!;
    // The card labels the rate with boxCurrency: the same currency the sum is made in.
    expect(boxCurrency(e.totals)).toBe("CZK");
    expect(r).toMatchObject({ currency: "CZK", earns: 12500, share: 22500, profitNow: -37500, profitThen: -25000 });
  });

  it("is nothing without box costs or cargo", () => {
    expect(whatIfOf(earnings({ boxCosts: null }), box(20, 13100), { cbm: 5, kg: 1000, rate: 100 })).toBeNull();
    expect(whatIfOf(earnings(), box(20, 13100), { cbm: 0, kg: 0, rate: 100 })).toBeNull();
    expect(whatIfOf(earnings(), null, { cbm: 5, kg: 1000, rate: 100 })).toBeNull();
  });
});
