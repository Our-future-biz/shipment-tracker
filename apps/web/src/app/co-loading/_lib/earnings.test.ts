import { describe, expect, it } from "vitest";
import { unpricedShipments, lead, breakEvenWords, profitGlance, unsoldWords, profitProvisional, amountWords, boxCostWords, boxRateWords, changeWords, earningsNotes, earningsWarnings, invoicedHint, marginWords, type BoxCostChange, type EarningsAmount, type EarningsRow, type SailingBoxCosts, type SailingEarnings } from "./earnings";

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
  cargoGap: null,
  cargoImplausible: false,
  odd: null,
  handRoadLines: 0,
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
  departureDate: null,
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
  breakEven: null,
  breakEvenWaitsFor: 0,
  unsold: null,
  notes: { noSelling: 0, unticked: 0, ownBox: 0, inMasterJob: 0, unrecognised: 0, noShare: 0, cargoGap: 0, cargoImplausible: 0, odd: 0, handRoad: 0, missingCurrencies: [], ...notes },
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
      "1 shipment has freight, fuel or terminal handling as buying costs of its own. They are not counted here: the box costs cover them.",
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
      "Provisional: valued at the ČNB rates of 23.11.2026 (1 EUR = 24.455 CZK), the latest ones, because the sailing has no departure date yet. Set it in Edit sailing to fix the rate.",
    );
    expect(boxRateWords(box({ set: true, rateDate: "2026-11-23", eurRate: 24.455, departureDate: "2026-12-18" }), day)).toBe(
      "Provisional: valued at the ČNB rates of 23.11.2026 (1 EUR = 24.455 CZK), the latest ones, until the rates of the departure date, 18.12.2026, are out.",
    );
    expect(boxRateWords(box({ set: true, rateDate: "2026-11-20", eurRate: 24.4, departureDate: "2026-11-21", rateProvisional: false }), day)).toBe(
      "Valued at the ČNB rates of 20.11.2026 (1 EUR = 24.4 CZK): the rates of the departure date, 21.11.2026.",
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

describe("a provisional profit", () => {
  const line = (currency: string, amount: number | null = 100) => ({ kind: "ocean" as const, amount, currency, note: "", czk: 1 });
  const withLines = (lines: ReturnType<typeof line>[], more: Partial<SailingBoxCosts> = {}) => earnings({ boxCosts: box({ set: true, containers: [{ containerNo: 1, lines, total: amt(0) }], ...more }) });
  it("is one whose box costs in another currency are valued at a rate that may still move", () => {
    expect(profitProvisional(withLines([line("USD")]))).toBe(true);
    expect(profitProvisional(withLines([line("USD")], { rateProvisional: false }))).toBe(false);
  });
  it("is not one when every box cost is in CZK, or none is set", () => {
    expect(profitProvisional(withLines([line("CZK"), line("USD", null)]))).toBe(false);
    expect(profitProvisional(earnings())).toBe(false);
  });
});

describe("break-even and unsold space in words", () => {
  it("say nothing while there is nothing to show", () => {
    expect(breakEvenWords(earnings())).toBeNull();
    expect(unsoldWords(earnings())).toBeNull();
  });
  it("say a break-even that is reached, one that is not, and one that cannot be", () => {
    expect(breakEvenWords(earnings({ breakEven: { wm: 38.4, loadedWm: 50.1, ofLoaded: 0.766, reached: true, boxPct: 57 } }))).toBe("Break-even at 38.4 W/M: reached, 50.1 W/M are loaded.");
    expect(breakEvenWords(earnings({ breakEven: { wm: 60, loadedWm: 50.1, ofLoaded: 1.2, reached: false, boxPct: 89 } }))).toBe(
      "Break-even at 60 W/M: not reached, 50.1 W/M are loaded. 9.9 W/M more at today's average earning would cover the box.",
    );
    expect(breakEvenWords(earnings({ breakEven: { wm: null, loadedWm: 5, ofLoaded: null, reached: false, boxPct: null } }))).toBe("No break-even: the 5 W/M loaded earn nothing before the box costs.");
  });
  it("say what the unsold space costs", () => {
    expect(unsoldWords(earnings({ unsold: { pct: 26, cost: amt(6500) } }))).toBe("Unsold space: 26% of the box, which is 260.00 EUR of the box costs. The loaded shipments carry it.");
    expect(unsoldWords(earnings({ unsold: { pct: 0, cost: amt(0) } }))).toBe("No unsold space: the box is full.");
  });
});

describe("a sailing's profit at a glance", () => {
  const p = (more: object) => ({
    sailingId: "s",
    moneyKnown: true,
    boxCostsSet: true,
    profit: amt(25000),
    marginPct: 10.1,
    complete: true,
    boxCostsComplete: true,
    revenueComplete: true,
    provisional: false,
    ...more,
  });
  it("says when it could not be read, when the money is not known and when no box cost is set: never a dash", () => {
    expect(profitGlance(undefined)).toEqual({ main: "Could not be read", note: null, tone: "amber" });
    expect(profitGlance(p({ moneyKnown: false, profit: null }))).toEqual({ main: "Not known", note: "the shipments' money could not be read", tone: "amber" });
    expect(profitGlance(p({ boxCostsSet: false, profit: null }))).toEqual({ main: "No box costs yet", note: null, tone: "slate" });
  });
  it("is the profit with its margin, and everything that makes it less than final", () => {
    expect(profitGlance(p({}))).toEqual({ main: "1,000.00 EUR", note: "10.1%", tone: null });
    expect(profitGlance(p({ provisional: true })).note).toBe("10.1% · provisional");
    expect(profitGlance(p({ boxCostsComplete: false })).note).toBe("10.1% · box costs not complete");
    expect(profitGlance(p({ revenueComplete: false })).note).toBe("10.1% · revenue not complete");
    expect(profitGlance(p({ complete: false, boxCostsComplete: false, revenueComplete: false, provisional: true })).note).toBe(
      "10.1% · incomplete · box costs not complete · revenue not complete · provisional",
    );
  });
  it("is red by the figure that is printed: a loss in EUR is a loss, whatever the CZK says", () => {
    expect(profitGlance(p({ profit: amt(-2500), marginPct: -1 }))).toEqual({ main: "-100.00 EUR", note: "-1.0%", tone: "red" });
    expect(profitGlance(p({ profit: { czk: 351, eur: -10 }, marginPct: -0.5 })).tone).toBe("red");
    expect(profitGlance(p({ profit: { czk: -351, eur: 10 } })).tone).toBeNull();
    expect(profitGlance(p({ profit: { czk: -351, eur: null } })).tone).toBe("red");
  });
});

describe("the figure that decides", () => {
  it("is the EUR one, CZK only where no EUR rate is known", () => {
    expect(lead({ czk: 351, eur: -10 })).toBe(-10);
    expect(lead({ czk: 351, eur: null })).toBe(351);
  });
  it("marks a row a loss by it", () => {
    expect(earningsNotes(row({ profit: { czk: 351, eur: -10 } })).map((n) => n.text)).toEqual(["Loss after its share of the box"]);
    expect(earningsNotes(row({ profit: { czk: -351, eur: 10 } }))).toEqual([]);
  });
});

describe("how much is invoiced, nearly all", () => {
  it("is not all until all of it is", () => {
    expect(invoicedHint(earnings({ totals: { ...earnings().totals, selling: amt(100000), invoiced: amt(99600) } }))).toBe("99% of the revenue");
    expect(invoicedHint(earnings({ totals: { ...earnings().totals, selling: amt(100000), invoiced: amt(100000) } }))).toBe("all of the revenue");
  });
});

describe("fix step 2 of Council Review 7", () => {
  it("says when the box cannot break even at today's earning", () => {
    expect(breakEvenWords(earnings({ breakEven: { wm: 70, loadedWm: 50.1, ofLoaded: 1.4, reached: false, boxPct: 104 } }))).toBe(
      "Break-even at 70 W/M: not reached, 50.1 W/M are loaded. That is 104% of the box: more than it takes, so it cannot break even at today's earning per W/M.",
    );
  });
  it("names the loaded shipments still to price while break-even waits for them", () => {
    const a = row({ shipmentId: "a", jobNumber: "CZLCL1", noSelling: true });
    const b = row({ shipmentId: "b", jobNumber: "CZLCL2", moneyKnown: false });
    const c = row({ shipmentId: "c", jobNumber: "CZLCL3" });
    const gone = row({ shipmentId: "d", jobNumber: "CZLCL4", counted: false, noSelling: true });
    expect(unpricedShipments(earnings({ rows: [a, b, c, gone], breakEvenWaitsFor: 2 }))).toEqual([
      { shipmentId: "a", jobNumber: "CZLCL1" },
      { shipmentId: "b", jobNumber: "CZLCL2" },
    ]);
    expect(unpricedShipments(earnings({ rows: [a] }))).toEqual([]);
  });
  it("warns about cargo figures, a shipment the box is not for and road freight typed by hand", () => {
    expect(earningsWarnings(earnings({}, { odd: 1, cargoImplausible: 1, cargoGap: 2, handRoad: 1 }))).toEqual([
      "1 shipment is not what this box is for. Take it off the sailing: it takes a share of the box costs meanwhile.",
      "1 shipment has cargo figures that cannot be right, so the shares of the box costs are not to be trusted until they are corrected.",
      "2 shipments have a weight or a volume missing: their shares of the box costs may be too low, and the others' too high.",
      "1 shipment has road freight typed by hand. If it is the trunk haul to the hub, it belongs under Origin Costs of the box: check it is not counted twice.",
    ]);
  });
  it("marks such a shipment's row", () => {
    expect(earningsNotes(row({ odd: "Air Freight", cargoGap: "volume", handRoadLines: 1 })).map((n) => n.text)).toEqual([
      "Air Freight: not what this box is for",
      "Volume missing: share may be too low",
      "Road freight typed by hand",
    ]);
    expect(earningsNotes(row({ cargoGap: "weight", cargoImplausible: true })).map((n) => n.text)).toEqual(["Cargo figures look wrong: check its share"]);
  });
});

describe("fix step 3 of Council Review 7", () => {
  const day = (d: string) => d.split("-").reverse().join(".");
  const change = (more: Partial<BoxCostChange>): BoxCostChange => ({ id: "1", containerNo: 0, kind: "containers", oldAmount: 2, oldCurrency: "", oldNote: "", newAmount: 1, newCurrency: "", newNote: "", changedByName: "Jana", changedAt: "2026-11-23T10:00:00Z", ...more });
  it("says a change of the number of containers and of the departure date in the record", () => {
    expect(changeWords(change({}), true, day)).toBe("Number of containers: 2 → 1");
    expect(changeWords(change({ kind: "departure", oldAmount: null, newAmount: null, oldNote: "", newNote: "2026-11-20" }), false, day)).toBe("Departure date: none → 20.11.2026");
    expect(changeWords(change({ kind: "departure", oldAmount: null, newAmount: null, oldNote: "2026-11-20", newNote: "" }), false, day)).toBe("Departure date: 20.11.2026 → none");
  });
  it("tells the manager to reopen a closed service to set the departure date", () => {
    expect(boxRateWords(box({ set: true, rateDate: "2026-11-23", eurRate: 24.455 }), day, true)).toBe(
      "Provisional: valued at the ČNB rates of 23.11.2026 (1 EUR = 24.455 CZK), the latest ones, because the sailing has no departure date yet. The service is closed: reopen it to set the date in Edit sailing.",
    );
  });
});
