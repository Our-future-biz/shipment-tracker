import { describe, expect, it } from "vitest";
import { amountWords, boxCostWords, boxRateWords, changeWords, earningsNotes, earningsWarnings, invoicedHint, marginWords, type BoxCostChange, type EarningsAmount, type EarningsRow, type SailingBoxCosts, type SailingEarnings } from "./earnings";

const amt = (czk: number, eur: number | null = czk / 25): EarningsAmount => ({ czk, eur });
const row = (more: Partial<EarningsRow> = {}): EarningsRow => ({
  shipmentId: "00000000-0000-4000-8000-000000000001",
  jobNumber: "CZLCL00000001",
  customer: "Alfa s.r.o.",
  status: "active",
  counted: true,
  freightTons: 2,
  moneyKnown: true,
  selling: amt(25000),
  invoiced: amt(0),
  inland: amt(5000),
  other: amt(0),
  beforeBox: amt(20000),
  ownBox: amt(0),
  masterJob: amt(0),
  boxShare: null,
  profit: null,
  noShare: false,
  noSelling: false,
  untickedLines: 0,
  unrecognisedLines: 0,
  missingCurrencies: [],
  inMasterJob: false,
  ...more,
});
const box = (more: Partial<SailingBoxCosts> = {}): SailingBoxCosts => ({
  set: false,
  containers: [{ containerNo: 1, lines: [], total: amt(0) }],
  total: amt(0),
  eurRate: 25,
  rateDate: null,
  rateProvisional: true,
  missingCurrencies: [],
  notSet: [],
  ignoredContainers: [],
  ...more,
});
const earnings = (more: Partial<SailingEarnings> = {}, notes: Partial<SailingEarnings["notes"]> = {}): SailingEarnings => ({
  moneyKnown: true,
  complete: true,
  totals: { shipments: 1, freightTons: 2, selling: amt(25000), invoiced: amt(10000), inland: amt(5000), other: amt(0), beforeBox: amt(20000), ownBox: amt(0), masterJob: amt(0), boxCosts: null, profit: null, marginPct: null },
  boxCosts: box(),
  boxUnshared: false,
  notes: { noSelling: 0, unticked: 0, ownBox: 0, inMasterJob: 0, unrecognised: 0, noShare: 0, missingCurrencies: [], ...notes },
  notCounted: 0,
  notCountedSelling: amt(0),
  rows: [row()],
  ...more,
});

describe("an amount on the Earnings tab", () => {
  it("is in EUR with CZK underneath", () => {
    expect(amountWords(amt(25000))).toEqual({ main: "1,000.00 EUR", under: "25,000.00 CZK" });
  });
  it("is in CZK alone when no EUR rate is known", () => {
    expect(amountWords(amt(25000, null))).toEqual({ main: "25,000.00 CZK", under: null });
  });
});

describe("the warnings above the earnings", () => {
  it("are none when nothing is off", () => {
    expect(earningsWarnings(earnings())).toEqual([]);
  });
  it("say only that nothing could be read when the money is not known", () => {
    const w = earningsWarnings(earnings({ moneyKnown: false }, { noSelling: 3 }));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("could not be read");
  });
  it("name what is left out and what is not counted", () => {
    const w = earningsWarnings(earnings({}, { noSelling: 1, unticked: 2, ownBox: 1, inMasterJob: 2, unrecognised: 1, missingCurrencies: ["USD"] }));
    expect(w).toEqual([
      "No exchange rate for USD: amounts in that currency are left out, so the totals are incomplete.",
      "1 shipment has no selling lines yet: the revenue is not complete.",
      '2 shipments have selling lines not ticked "Invoice": those lines are not counted.',
      "1 shipment has freight or local charges as buying costs of its own. They are not counted here: the box's costs cover them.",
      "2 shipments are in a master job as well. Costs shared from a master job are not counted here.",
      "1 shipment has buying lines with no charge code the app knows: they are counted as other shipment costs.",
    ]);
  });
  it("say when one shipment's money could not be read", () => {
    expect(earningsWarnings(earnings({ rows: [row({ moneyKnown: false })] }))[0]).toBe("The money of 1 shipment could not be read: the totals are incomplete.");
  });
});

describe("the marks on a shipment's row", () => {
  it("are none for a plain shipment", () => {
    expect(earningsNotes(row())).toEqual([]);
  });
  it("say a cancelled shipment is not counted", () => {
    expect(earningsNotes(row({ counted: false }))[0]).toEqual({ text: "Cancelled: not counted", tone: "slate" });
  });
  it("say only that the money is not known when it is not", () => {
    expect(earningsNotes(row({ moneyKnown: false, noSelling: true }))).toEqual([{ text: "Money not known", tone: "red" }]);
  });
  it("name each thing to look at", () => {
    const notes = earningsNotes(row({ noSelling: true, untickedLines: 1, missingCurrencies: ["USD"], beforeBox: amt(-500), ownBox: amt(12500), inMasterJob: true, unrecognisedLines: 2 }));
    expect(notes.map((n) => n.text)).toEqual([
      "No selling lines",
      "1 selling line not ticked",
      "No rate: USD",
      "Costs more than it sells for",
      "Own freight costs 500.00 EUR: not counted",
      "In a master job",
      "2 cost lines without a code",
    ]);
  });
});

describe("how much is invoiced", () => {
  it("is a share of the revenue", () => {
    expect(invoicedHint(earnings())).toBe("40% of the revenue");
    expect(invoicedHint(earnings({ totals: { ...earnings().totals, invoiced: amt(25000) } }))).toBe("all of the revenue");
    expect(invoicedHint(earnings({ totals: { ...earnings().totals, selling: amt(0) } }))).toBe("nothing to invoice yet");
  });
});

describe("the warnings about the box costs", () => {
  it("are none while no box cost is set", () => {
    expect(earningsWarnings(earnings({ boxCosts: box({ notSet: [{ containerNo: 1, kind: "ocean" }] }) }))).toEqual([]);
  });
  it("name a cost not set yet, a currency with no rate, shipments with no share and a container that is gone", () => {
    const two = [
      { containerNo: 1, lines: [], total: amt(0) },
      { containerNo: 2, lines: [], total: amt(0) },
    ];
    const w = earningsWarnings(
      earnings({ boxCosts: box({ set: true, containers: two, missingCurrencies: ["CNY"], notSet: [{ containerNo: 2, kind: "ocean" }], ignoredContainers: [3] }) }, { noShare: 1 }),
    );
    expect(w).toEqual([
      "No exchange rate for the box costs in CNY: those amounts are left out, so the profit is too high.",
      "Not set yet: Ocean Freight of container 2. The profit does not carry it.",
      "1 shipment has no weight and no volume, so it carries no share of the box costs.",
      "Costs are kept for container 3, which the sailing no longer has. They are not counted.",
    ]);
  });
  it("say when the box costs cannot be shared at all", () => {
    expect(earningsWarnings(earnings({ boxCosts: box({ set: true }), boxUnshared: true }))).toEqual([
      "No shipment has a weight or a volume, so the box costs cannot be shared: the total carries them, no shipment does.",
    ]);
  });
});

describe("box costs in words", () => {
  it("say an amount in its own currency, or that it is not set", () => {
    expect(boxCostWords(2100, "USD")).toBe("2,100.00 USD");
    expect(boxCostWords(0, "EUR")).toBe("0.00 EUR");
    expect(boxCostWords(null, "EUR")).toBe("Not set");
  });
  it("say the margin with one decimal", () => {
    expect(marginWords(24.8)).toBe("24.8%");
    expect(marginWords(-5)).toBe("-5.0%");
    expect(marginWords(null)).toBe("—");
  });
  it("say which day's rates value them", () => {
    const day = (d: string) => d.split("-").reverse().join(".");
    expect(boxRateWords(box(), day)).toBeNull();
    expect(boxRateWords(box({ set: true, rateDate: "2026-11-23", eurRate: 24.455 }), day)).toBe(
      "Valued at the ČNB rates of 23.11.2026 (1 EUR = 24.455 CZK). The latest rates are used, so the figures move with them.",
    );
    expect(boxRateWords(box({ set: true, rateDate: null }), day)).toBe("The exchange rates could not be read: only amounts in CZK are valued.");
  });
  it("say a kept change", () => {
    const change = (more: Partial<BoxCostChange>): BoxCostChange => ({
      id: "1",
      containerNo: 2,
      kind: "ocean",
      oldAmount: 2100,
      oldCurrency: "USD",
      oldNote: "",
      newAmount: 2250,
      newCurrency: "USD",
      newNote: "",
      changedByName: "Jana",
      changedAt: "2026-11-23T10:00:00Z",
      ...more,
    });
    expect(changeWords(change({}), true)).toBe("Ocean Freight of container 2: 2,100.00 USD → 2,250.00 USD");
    expect(changeWords(change({ oldAmount: null, oldCurrency: "" }), false)).toBe("Ocean Freight: Not set → 2,250.00 USD");
    expect(changeWords(change({ newAmount: 2100, newNote: "MSC" }), false)).toBe('Ocean Freight: note "MSC"');
    expect(changeWords(change({ newAmount: 2100, newCurrency: "EUR" }), false)).toBe("Ocean Freight: 2,100.00 USD → 2,100.00 EUR");
  });
});

describe("the marks about the box on a shipment's row", () => {
  it("say it has no share, or that it loses after its share", () => {
    expect(earningsNotes(row({ noShare: true })).map((n) => n.text)).toEqual(["No weight or volume: no share of the box"]);
    expect(earningsNotes(row({ profit: amt(-100) })).map((n) => n.text)).toEqual(["Loss after its share of the box"]);
  });
});
