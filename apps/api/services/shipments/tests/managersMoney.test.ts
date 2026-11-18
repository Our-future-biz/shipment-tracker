import { describe, expect, it } from "vitest";
import type { OperationsMoney, OperationsMoneyJobDates } from "../../invoicing/interfaces/interfaces";
import { COCKPIT_LIST_LIMIT } from "../lib/cockpitThresholds";
import type { OpsCockpitJob } from "../lib/managersCockpit";
import {
  MONEY_GAPS,
  MONEY_RANK,
  MONEY_SIGNAL_KINDS,
  accrualSignals,
  amountsText,
  billingSince,
  buildOpsMoney,
  costAfterBillingSignals,
  costClaimSignals,
  creditSignals,
  currenciesWithoutRate,
  czkLabel,
  czkText,
  czkTotalOf,
  dayOfStamp,
  inBillingSignals,
  isBilled,
  isInBilling,
  isMarginNotKnown,
  jobMoneyOf,
  lossSignals,
  marginSignals,
  moneyClaimsOf,
  moneyJobs,
  moneySignals,
  moneyText,
  needsRates,
  notInvoicedSignals,
  notRechargedSignals,
  overLimit,
  perCurrency,
  percentText,
  releaseDue,
  statusChangesOf,
  supplierInvoiceSignals,
  untickedSignals,
  type CustomerCredit,
  type InvoicingJobDates,
  type InvoicingMoney,
  type InvoicingMoneyJob,
  type InvoicingSupplierInvoices,
  type JobMoney,
  type MoneyClaim,
  type MoneySignal,
  type OpenCostClaimRow,
  type OpsMoneyInput,
} from "../lib/managersMoney";
import type { OpsMoneyPerson } from "../interfaces/interfaces";

// November 2026, the days these tests stand on:
//   Thu 12 · Fri 13 · Sat 14 · Sun 15 · Mon 16 · Tue 17 (a public holiday) · Wed 18
// Wednesday 18 Nov 2026, 11:00 in Prague.
const NOW = new Date("2026-11-18T10:00:00Z");
const TODAY = "2026-11-18";
/** A moment of a November day on Prague's clock (CET, an hour ahead of UTC). */
const at = (day: string, time = "11:00") => new Date(`${day}T${time}:00+01:00`);

let seq = 0;
// An active job nothing asks about: every rule is switched on by what a test hands over.
const job = (over: Partial<OpsCockpitJob> = {}): OpsCockpitJob => {
  seq += 1;
  return {
    id: `id-${seq}`,
    jobNumber: `CZFCL${String(seq).padStart(8, "0")}`,
    customer: "ACME s.r.o.",
    tradeDirection: "Import",
    freightMode: "Sea Freight",
    department: "Operation Department",
    status: "Booked [IMP]",
    estimatedDeparture: null,
    actualDeparture: null,
    estimatedArrival: null,
    actualArrival: null,
    etaWarehouse: null,
    warehouseReceivedDate: null,
    warehouseReleasedDate: null,
    plannedDeliveryDate: null,
    actualDeliveryDate: null,
    personInCharge: "jan@firma.cz",
    holidayCover: "",
    closingDate: null,
    closingTime: "",
    vgmClosing: null,
    vgmClosingTime: "",
    vgm: "",
    siClosing: null,
    siClosingTime: "",
    shippingInstructions: "",
    ams: "",
    amsDeadline: null,
    amsDeadlineTime: "",
    isf: "",
    isfDeadline: null,
    isfDeadlineTime: "",
    customsPriority: "Standard",
    customsStatus: "",
    customsDeadline: "",
    bookingConfirmation: "Received",
    claim: "No",
    cargoReadinessDate: null,
    pickupDate: null,
    masterBolNumber: "",
    masterBolType: "",
    houseBolType: "",
    houseBolRelease: "",
    bolDraft: "Approved",
    plateNumber: "",
    creditCheck: "Green",
    dangerous: "No",
    loadType: "Consolidation",
    masterJobId: null,
    customsProcedure: "",
    customsOffice: "",
    mrn: "",
    arrivalNoticeSent: true,
    createdAt: new Date("2026-11-01T08:00:00Z"),
    updatedAt: new Date("2026-11-01T08:00:00Z"),
    ...over,
  };
};

const QUIET_TOTALS: JobMoney["totals"] = { profitCzk: 10_000, marginPct: 20, estimateOfRealCzk: 0, realOfEstimatedCzk: 0, ratesNote: "", missingCurrencies: [] };
const QUIET_INVOICES: InvoicingSupplierInvoices = { toApprove: 0, refused: 0, lastRefusedOn: null, claimed: 0, approvedOverdue: 0, oldestWaitingSince: null, afterBilling: [] };
type TestMoney = JobMoney & { shipmentId: string };
// What is known of the money of a job nothing is wrong with: a healthy margin, nothing left to bill, everything else empty.
const money = (shipmentId: string, over: Partial<Omit<JobMoney, "totals" | "supplierInvoices">> & { totals?: Partial<JobMoney["totals"]>; supplierInvoices?: Partial<InvoicingSupplierInvoices> | null } = {}): TestMoney => ({
  shipmentId,
  notYetInvoiced: [],
  untickedSelling: [],
  sellingLines: 2,
  costLines: 2,
  invoicesRead: true,
  notRecharged: [],
  estimatesOpen: { lines: 0, oldestSince: null, amounts: [] },
  ...over,
  totals: { ...QUIET_TOTALS, ...over.totals },
  supplierInvoices: over.supplierInvoices === null ? null : { ...QUIET_INVOICES, ...over.supplierInvoices },
});
// The same job as Invoicing answers it.
const answered = (shipmentId: string, over: Partial<InvoicingMoneyJob> = {}): InvoicingMoneyJob => ({
  shipmentId,
  notYetInvoiced: [],
  untickedSelling: [],
  sellingLines: 2,
  costLines: 2,
  totals: { ...QUIET_TOTALS, sellingCzk: 50_000, estimateCzk: 40_000, realCzk: 0, costCzk: 40_000 },
  invoicedOn: null,
  notRecharged: [],
  supplierInvoices: QUIET_INVOICES,
  estimatesOpen: { lines: 0, oldestSince: null, amounts: [] },
  ...over,
});
const eur = (amount: number) => ({ currency: "EUR", amount });
const czk = (amount: number) => ({ currency: "CZK", amount });
const words = (signals: readonly MoneySignal[]) => signals.map((s) => [s.urgent ? "URGENT" : "ATTENTION", s.text]);
const BILLING = { status: "Billing [IMP]" };
const BOOKED = { status: "Booked [IMP]" };
const LABEL = "at today's ČNB rate (18.11.)";
/** A change of status as the history tells it. */
const changed = (day: string, status = "Billing [IMP]", time = "11:00") => ({ status, at: at(day, time) });

const answer = (jobs: OpsCockpitJob[], over: Partial<OpsMoneyInput> = {}) =>
  buildOpsMoney({
    jobs,
    invoicedIds: new Set(),
    invoicing: new Map(jobs.map((j) => [j.id, money(j.id)])),
    customerOf: new Map(jobs.map((j) => [j.id, null])),
    credit: new Map(),
    creditRates: null,
    claims: new Map(),
    statusChangedAt: new Map(),
    czk: { rates: { EUR: 25, USD: 22 }, label: LABEL },
    userEmails: new Set(["jan@firma.cz", "eva@firma.cz"]),
    holidays: [],
    holidaysKnown: true,
    notKnown: [],
    capped: false,
    mode: "all",
    direction: "all",
    handledBy: null,
    reports: "all",
    reportEmails: null,
    now: NOW,
    ...over,
  });
/** Invoicing's facts of the jobs given, by id. */
const facts = (...jobs: TestMoney[]) => new Map(jobs.map((m) => [m.shipmentId, m]));
/** A person of the people line with nothing on them but one active job. */
const person = (handledBy: string, over: Partial<OpsMoneyPerson> = {}): OpsMoneyPerson => ({ handledBy, isUser: true, active: 1, notYetInvoiced: [], jobsAtLoss: 0, estimatesOpen: 0, supplierInvoicesWaiting: 0, costClaimsOpen: 0, ...over });
/** A job with a loss: URGENT once it is billed. */
const LOSS = { totals: { profitCzk: -100, marginPct: -1 } };

describe("how money is written in a tag", () => {
  it("writes an amount with its thousands apart, two decimals and the currency after it", () => {
    expect(moneyText(1450, "EUR")).toBe("1,450.00 EUR");
    expect(moneyText(1234567.891, "CZK")).toBe("1,234,567.89 CZK");
    expect(moneyText(0.5, "USD")).toBe("0.50 USD");
    expect(moneyText(-320, "EUR")).toBe("−320.00 EUR");
    // Nothing is not "minus nothing".
    expect(moneyText(-0.001, "EUR")).toBe("0.00 EUR");
  });

  it("writes a margin figure in whole crowns, a loss with a minus - and keeps the hellers of a figure under one crown", () => {
    expect(czkText(4210.4)).toBe("4,210 CZK");
    expect(czkText(-4210.4)).toBe("−4,210 CZK");
    expect(czkText(640)).toBe("640 CZK");
    expect(czkText(0)).toBe("0 CZK");
    expect(czkText(-0.4)).toBe("−0.40 CZK");
  });

  it("writes a margin with one decimal", () => {
    expect(percentText(3.24)).toBe("3.2 %");
    expect(percentText(20)).toBe("20.0 %");
    expect(percentText(-1.46)).toBe("−1.5 %");
    expect(percentText(-0.01)).toBe("0.0 %");
  });

  it("never adds one currency to another: amounts are summed per currency and listed side by side", () => {
    expect(perCurrency([eur(100.1), czk(2500), eur(200.2), { currency: " usd ", amount: 5 }])).toEqual([czk(2500), eur(300.3), { currency: "USD", amount: 5 }]);
    expect(amountsText([eur(1450), czk(3200), eur(50)])).toBe("3,200.00 CZK, 1,500.00 EUR");
    // Cents are counted, not floating fractions; a currency whose sum is nothing is left out.
    expect(perCurrency([eur(0.1), eur(0.2), czk(10), czk(-10)])).toEqual([eur(0.3)]);
    expect(amountsText([])).toBe("");
  });

  it("adds currencies in one place only - the CZK figure - at the rates handed in, labelled, and only when every currency has one", () => {
    expect(czkLabel("2026-11-18")).toBe("at today's ČNB rate (18.11.)");
    const rates = { rates: { EUR: 25 }, label: LABEL };
    expect(czkTotalOf([eur(100), czk(500), eur(0.5)], rates)).toEqual({ amount: 3012.5, label: LABEL });
    // A currency with no rate: no figure at all, never the rest alone - and the currency is named.
    expect(czkTotalOf([eur(100), { currency: "USD", amount: 1 }, { currency: "GBP", amount: 1 }], rates)).toBeNull();
    expect(currenciesWithoutRate([eur(100), { currency: "USD", amount: 1 }, { currency: "GBP", amount: 1 }, czk(5)], rates)).toEqual(["GBP", "USD"]);
    expect(currenciesWithoutRate([eur(100), czk(5)], rates)).toEqual([]);
    // CZK itself needs no rate: with no sheet read, what is all in CZK still has its figure.
    // All in CZK already - or nothing at all: no rate is used, so there is no rate to name; the label is "".
    expect(czkTotalOf([czk(500), czk(0.25)], rates)).toEqual({ amount: 500.25, label: "" });
    expect(czkTotalOf([czk(500), czk(0.25)], { rates: {}, label: LABEL })).toEqual({ amount: 500.25, label: "" });
    expect(czkTotalOf([czk(500)], null)).toEqual({ amount: 500, label: "" });
    expect(czkTotalOf([], rates)).toEqual({ amount: 0, label: "" });
    // A currency that nets to nothing is not converted either.
    expect(czkTotalOf([czk(500), eur(10), eur(-10)], rates)).toEqual({ amount: 500, label: "" });
    // No rates at all and something to convert: no figure.
    expect(czkTotalOf([czk(500), eur(1)], null)).toBeNull();
    expect(currenciesWithoutRate([eur(1), czk(1)], null)).toEqual(["EUR"]);
  });

  it("reads a day or a moment another service sends as its Prague day", () => {
    expect(dayOfStamp("2026-11-13")).toBe("2026-11-13");
    // 23:30 UTC on the 12th is the 13th in Prague.
    expect(dayOfStamp("2026-11-12T23:30:00.000Z")).toBe("2026-11-13");
    expect(dayOfStamp("2026-13-45")).toBeNull();
    expect(dayOfStamp("soon")).toBeNull();
    expect(dayOfStamp(null)).toBeNull();
    expect(dayOfStamp("")).toBeNull();
  });
});

describe("margin", () => {
  it("is URGENT for a loss on a job that is billed - in a Billing status, or reading Invoiced - with the loss in whole crowns", () => {
    const loss = money("a", { totals: { profitCzk: -4210, marginPct: -8.4 } });
    expect(words(marginSignals(loss, true))).toEqual([["URGENT", "Loss −4,210 CZK"]]);
    expect(marginSignals(loss, true)[0]).toMatchObject({ rank: MONEY_RANK.loss, kind: "margin" });
    expect(words(lossSignals(loss, true))).toEqual([["URGENT", "Loss −4,210 CZK"]]);
    expect(lossSignals(loss, false)).toEqual([]);
    expect(lossSignals(money("a", { totals: { profitCzk: null } }), true)).toEqual([]);
    // A profit of nothing is no loss.
    expect(words(marginSignals(money("a", { totals: { profitCzk: 0, marginPct: 0 } }), true))).toEqual([["ATTENTION", "Margin 0.0 % · profit 0 CZK"]]);
  });

  it("reads 'billed' off the job: a Billing or Billed status, or Invoiced - never off an invoice that merely exists", () => {
    expect(isBilled({ status: "Billing [IMP]" }, false)).toBe(true);
    expect(isBilled({ status: "Billed [EXP]" }, false)).toBe(true);
    expect(isBilled({ status: "Booked [IMP]" }, true)).toBe(true);
    // An active job that is not in Billing - invoiced in advance or not - is still being worked on.
    expect(isBilled({ status: "Booked [IMP]" }, false)).toBe(false);
  });

  it("is ATTENTION for a loss on a job that is not billed: it is still being worked on - and only with selling lines", () => {
    const loss = money("a", { totals: { profitCzk: -640, marginPct: -3.2 } });
    expect(words(marginSignals(loss, false))).toEqual([["ATTENTION", "Margin −3.2 % · profit −640 CZK"]]);
    expect(words(marginSignals({ ...loss, sellingLines: 0, costLines: 0 }, false))).toEqual([]);
  });

  it("is ATTENTION under 5 per cent or under 1,000 CZK on a job with selling lines - not at them", () => {
    const of = (profitCzk: number, marginPct: number | null) => words(marginSignals(money("a", { totals: { profitCzk, marginPct } }), true));
    expect(of(640, 3.2)).toEqual([["ATTENTION", "Margin 3.2 % · profit 640 CZK"]]);
    // A thin margin on a large job, a small profit at a fine margin: either is enough.
    expect(of(40_000, 4.99)).toEqual([["ATTENTION", "Margin 5.0 % · profit 40,000 CZK"]]);
    expect(of(999.99, 30)).toEqual([["ATTENTION", "Margin 30.0 % · profit 1,000 CZK"]]);
    expect(of(40_000, 5)).toEqual([]);
    expect(of(1000, 30)).toEqual([]);
    // No margin to give (nothing sold in CZK terms): the profit alone.
    expect(of(500, null)).toEqual([["ATTENTION", "Profit 500 CZK"]]);
    expect(of(5000, null)).toEqual([]);
  });

  it("says the real costs are over their estimates - like for like, over the lines that have both - only by more than 10 per cent AND more than 2,000 CZK", () => {
    const of = (estimateOfRealCzk: number | null, realOfEstimatedCzk: number | null) => words(marginSignals(money("a", { totals: { estimateOfRealCzk, realOfEstimatedCzk } }), true));
    expect(of(35_000, 41_300)).toEqual([["ATTENTION", "Real cost 18 % over estimate · +6,300 CZK"]]);
    // Over by 2,000 exactly, or by 10 per cent exactly: not yet.
    expect(of(10_000, 12_000)).toEqual([]);
    expect(of(10_000, 12_000.01)).toEqual([["ATTENTION", "Real cost 20 % over estimate · +2,000 CZK"]]);
    expect(of(30_000, 33_000)).toEqual([]);
    expect(of(30_000, 33_000.5)).toEqual([["ATTENTION", "Real cost 10 % over estimate · +3,001 CZK"]]);
    // A large share of a small estimate is under the 2,000; a large sum on a large job is under the 10 per cent.
    expect(of(1000, 2900)).toEqual([]);
    expect(of(100_000, 109_000)).toEqual([]);
    // Under the estimate; no line with both (0 and 0); an estimate of nothing; a figure not known: no tag.
    expect(of(40_000, 30_000)).toEqual([]);
    expect(of(0, 0)).toEqual([]);
    expect(of(0, 9000)).toEqual([]);
    expect(of(null, 9000)).toEqual([]);
    expect(of(9000, null)).toEqual([]);
    expect(of(null, null)).toEqual([]);
  });

  it("says costs with no selling line, whatever the figures", () => {
    const none = money("a", { sellingLines: 0, costLines: 3, totals: { profitCzk: -9000, marginPct: null } });
    expect(words(marginSignals(none, false))).toEqual([["ATTENTION", "Costs and no selling line"]]);
    expect(words(marginSignals(none, true))).toEqual([
      ["URGENT", "Loss −9,000 CZK"],
      ["ATTENTION", "Costs and no selling line"],
    ]);
    expect(words(marginSignals(money("a", { sellingLines: 0, costLines: 0 }), true))).toEqual([]);
  });

  it("gives no margin tag when a rate is missing - the margin is not known, never 0 - and the job is counted as such", () => {
    const unknown = money("a", { totals: { profitCzk: null, marginPct: null, estimateOfRealCzk: null, realOfEstimatedCzk: null, ratesNote: "missing", missingCurrencies: ["USD"] } });
    expect(marginSignals(unknown, true)).toEqual([]);
    expect(isMarginNotKnown(unknown)).toBe(true);
    expect(isMarginNotKnown(money("a"))).toBe(false);
    // A job with no line at all has nothing to work a margin out of: it is not "not known".
    expect(isMarginNotKnown({ ...unknown, sellingLines: 0, costLines: 0 })).toBe(false);
    // Costs and no selling line needs no rate.
    expect(words(marginSignals({ ...unknown, sellingLines: 0 }, true))).toEqual([["ATTENTION", "Costs and no selling line"]]);
  });
});

describe("not invoiced", () => {
  it("reads Billing as the cockpit's own rule does", () => {
    expect(isInBilling({ status: "Billing [IMP]" })).toBe(true);
    expect(isInBilling({ status: "billing [EXP]" })).toBe(true);
    expect(isInBilling({ status: "Billed [IMP]" })).toBe(true);
    expect(isInBilling({ status: "Booked [IMP]" })).toBe(false);
  });

  it("says a job in Billing for more than 2 working days with work left to bill - with the amount, and that it waits on Invoicing", () => {
    const m = money("a", { notYetInvoiced: [eur(5000)] });
    // Friday 13th 10:59 → Monday, (Tuesday a holiday), Wednesday 10:59: two working days are over at 11:00.
    expect(words(inBillingSignals(BILLING, m, at("2026-11-13", "10:59"), NOW, []))).toEqual([["ATTENTION", "In Billing since 13.11., 5,000.00 EUR not invoiced · with Invoicing"]]);
    expect(inBillingSignals(BILLING, m, at("2026-11-13", "10:59"), NOW, [])[0]).toMatchObject({ rank: MONEY_RANK.inBilling, kind: "not_invoiced" });
    // Exactly two working days: not more than two.
    expect(inBillingSignals(BILLING, m, at("2026-11-13", "11:00"), NOW, [])).toEqual([]);
    // The company is off on Friday the 13th and Monday the 16th: only Wednesday counts since Thursday the 12th.
    expect(inBillingSignals(BILLING, m, at("2026-11-12", "10:00"), NOW, [])).not.toEqual([]);
    expect(inBillingSignals(BILLING, m, at("2026-11-12", "10:00"), NOW, ["2026-11-13", "2026-11-16"])).toEqual([]);
    // Several currencies: side by side.
    expect(words(inBillingSignals(BILLING, money("a", { notYetInvoiced: [eur(5000), czk(1200)] }), at("2026-10-25"), NOW, []))).toEqual([
      ["ATTENTION", "In Billing since 25.10., 1,200.00 CZK, 5,000.00 EUR not invoiced · with Invoicing"],
    ]);
  });

  it("goes by the work left to bill, not by whether an invoice exists: one open invoice and lines on none is still not invoiced", () => {
    const long = at("2026-10-25");
    // Invoicing's answer of a job with an open invoice and 5,000 EUR of selling lines on no invoice.
    const partly = jobMoneyOf(answered("a", { invoicedOn: "2026-11-01", notYetInvoiced: [eur(5000)] }), true);
    expect(words(inBillingSignals(BILLING, partly, long, NOW, []))).toEqual([["ATTENTION", "In Billing since 25.10., 5,000.00 EUR not invoiced · with Invoicing"]]);
    // No invoice at all and nothing valued left to bill: nothing waits on Invoicing.
    expect(inBillingSignals(BILLING, jobMoneyOf(answered("a"), true), long, NOW, [])).toEqual([]);
    expect(inBillingSignals(BILLING, money("a", { notYetInvoiced: [eur(0)] }), long, NOW, [])).toEqual([]);
  });

  it("words a Billed status as that", () => {
    const m = money("a", { notYetInvoiced: [eur(5000)] });
    expect(words(inBillingSignals({ status: "Billed [IMP]" }, m, at("2026-10-25"), NOW, []))).toEqual([["ATTENTION", "Billed since 25.10., 5,000.00 EUR not invoiced · with Invoicing"]]);
    expect(words(inBillingSignals({ status: "Billing [EXP]" }, m, at("2026-10-25"), NOW, []))).toEqual([["ATTENTION", "In Billing since 25.10., 5,000.00 EUR not invoiced · with Invoicing"]]);
  });

  it("does not say it of a job that is not in Billing, whose day is not known, or whose work not yet invoiced is not known", () => {
    const long = at("2026-11-02");
    const m = money("a", { notYetInvoiced: [eur(5000)] });
    expect(inBillingSignals(BOOKED, m, long, NOW, [])).toEqual([]);
    expect(inBillingSignals(BILLING, m, null, NOW, [])).toEqual([]);
    expect(inBillingSignals(BILLING, money("a", { notYetInvoiced: null }), long, NOW, [])).toEqual([]);
  });

  it("counts from the last change of the status when it set the status the job has - from the job's creation when it never changed - and not at all otherwise", () => {
    const j = { createdAt: at("2026-11-01"), status: "Billing [IMP]" };
    expect(billingSince(j, changed("2026-11-12"), true)).toEqual(at("2026-11-12"));
    expect(billingSince(j, changed("2026-11-12", " billing [imp] "), true)).toEqual(at("2026-11-12"));
    expect(billingSince(j, undefined, true)).toEqual(at("2026-11-01"));
    // The history could not be read.
    expect(billingSince(j, changed("2026-11-12"), false)).toBeNull();
    expect(billingSince(j, undefined, false)).toBeNull();
    // Its last change set another status than it has: it got there by a way the history did not record.
    expect(billingSince(j, changed("2026-11-12", "Arrived [IMP]"), true)).toBeNull();
    expect(billingSince(j, { status: null, at: at("2026-11-12") }, true)).toBeNull();
    // Billing, then Billed: the day it became Billed.
    expect(billingSince({ ...j, status: "Billed [IMP]" }, changed("2026-11-14", "Billed [IMP]"), true)).toEqual(at("2026-11-14"));
    expect(billingSince({ ...j, status: "Billed [IMP]" }, changed("2026-11-12", "Billing [IMP]"), true)).toBeNull();
    expect(
      statusChangesOf([
        { shipmentId: "a", newValue: "Billing [IMP]", changedAt: at("2026-11-12") },
        { shipmentId: "b", newValue: null, changedAt: at("2026-11-13") },
      ]),
    ).toEqual(
      new Map([
        ["a", { status: "Billing [IMP]", at: at("2026-11-12") }],
        ["b", { status: null, at: at("2026-11-13") }],
      ]),
    );
  });

  it("adds the amount to a job past its tax date that is not released for billing, per currency - whether or not an invoice exists", () => {
    const arrived = { tradeDirection: "Import", department: "Operation Department", status: "Arrived [IMP]", actualArrival: "2026-11-10", actualDeparture: null, actualDeliveryDate: null };
    const m = money("a", { notYetInvoiced: [eur(1450)] });
    expect(words(notInvoicedSignals(arrived, m, TODAY))).toEqual([["ATTENTION", "Not invoiced · 1,450.00 EUR"]]);
    expect(notInvoicedSignals(arrived, m, TODAY)[0]).toMatchObject({ rank: MONEY_RANK.notInvoiced, kind: "not_invoiced" });
    expect(words(notInvoicedSignals(arrived, money("a", { notYetInvoiced: [eur(1450), czk(3200), eur(50)] }), TODAY))).toEqual([["ATTENTION", "Not invoiced · 3,200.00 CZK, 1,500.00 EUR"]]);
    expect(words(notInvoicedSignals(arrived, jobMoneyOf(answered("a", { invoicedOn: "2026-11-11", notYetInvoiced: [eur(5000)] }), true), TODAY))).toEqual([["ATTENTION", "Not invoiced · 5,000.00 EUR"]]);
    // In Billing it is released: that tag speaks. Not arrived: no tax date yet. Nothing valued, or not known: nothing to say.
    expect(notInvoicedSignals({ ...arrived, status: "Billing [IMP]" }, m, TODAY)).toEqual([]);
    expect(notInvoicedSignals({ ...arrived, actualArrival: null }, m, TODAY)).toEqual([]);
    expect(notInvoicedSignals(arrived, money("a"), TODAY)).toEqual([]);
    expect(notInvoicedSignals(arrived, money("a", { notYetInvoiced: [eur(0)] }), TODAY)).toEqual([]);
    expect(notInvoicedSignals(arrived, money("a", { notYetInvoiced: null }), TODAY)).toEqual([]);
  });

  it("is URGENT from 15 days after the tax date - an export's ATD, a Domestic job's delivery", () => {
    const m = money("a", { notYetInvoiced: [eur(1450)] });
    const arrived = (actualArrival: string) => ({ tradeDirection: "Import", department: "", status: "Arrived [IMP]", actualArrival, actualDeparture: null, actualDeliveryDate: null });
    expect(words(notInvoicedSignals(arrived("2026-11-04"), m, TODAY))).toEqual([["ATTENTION", "Not invoiced · 1,450.00 EUR"]]);
    expect(words(notInvoicedSignals(arrived("2026-11-03"), m, TODAY))).toEqual([["URGENT", "Not invoiced · 1,450.00 EUR"]]);
    expect(notInvoicedSignals(arrived("2026-11-03"), m, TODAY)[0]).toMatchObject({ rank: MONEY_RANK.notInvoicedLate, kind: "not_invoiced" });
    const exported = { tradeDirection: "Export", department: "", status: "Departed [EXP]", actualArrival: "2026-11-17", actualDeparture: "2026-11-01", actualDeliveryDate: null };
    expect(words(notInvoicedSignals(exported, m, TODAY))).toEqual([["URGENT", "Not invoiced · 1,450.00 EUR"]]);
    const domestic = { tradeDirection: "Domestic", department: "Road Department", status: "Delivered [DOM]", actualArrival: "2026-10-01", actualDeparture: "2026-10-01", actualDeliveryDate: "2026-11-10" };
    expect(words(notInvoicedSignals(domestic, m, TODAY))).toEqual([["ATTENTION", "Not invoiced · 1,450.00 EUR"]]);
  });
});

describe("selling lines not ticked", () => {
  it("says the valued lines that are not ticked on a job in Billing: they hold it open", () => {
    const m = money("a", { untickedSelling: [eur(320)] });
    expect(words(untickedSignals(BILLING, m))).toEqual([["ATTENTION", "Selling line not ticked · 320.00 EUR: holds the job open"]]);
    expect(untickedSignals(BILLING, m)[0]).toMatchObject({ rank: MONEY_RANK.unticked, kind: "unticked" });
    expect(words(untickedSignals(BILLING, money("a", { untickedSelling: [eur(320), czk(1000)] })))).toEqual([["ATTENTION", "Selling line not ticked · 1,000.00 CZK, 320.00 EUR: holds the job open"]]);
    expect(untickedSignals({ status: "Booked [IMP]" }, m)).toEqual([]);
    expect(untickedSignals(BILLING, money("a"))).toEqual([]);
  });
});

describe("costs after billing", () => {
  let invoices = 0;
  const invoice = (over = {}) => ({ id: `si-${++invoices}`, number: "FV-77", supplier: "Maersk", currency: "CZK", amount: 12_400, aboveEstimate: true, bookedOn: "2026-11-14", ...over });
  const of = (...afterBilling: ReturnType<typeof invoice>[]) => costAfterBillingSignals(money("a", { supplierInvoices: { afterBilling } }), TODAY);

  it("is URGENT for a supplier invoice booked after billing and above the estimate, ATTENTION for one that is not - each with the day it was booked", () => {
    const above = of(invoice());
    expect(words(above)).toEqual([["URGENT", "Supplier invoice after billing, above estimate · Maersk 12,400.00 CZK · booked 14.11."]]);
    expect(above[0]).toMatchObject({ rank: MONEY_RANK.costAfterBillingAbove, kind: "cost_after_billing" });
    const within = of(invoice({ aboveEstimate: false, currency: "EUR", amount: 300 }));
    expect(words(within)).toEqual([["ATTENTION", "Supplier invoice after billing · Maersk 300.00 EUR · booked 14.11."]]);
    expect(within[0]).toMatchObject({ rank: MONEY_RANK.costAfterBilling, kind: "cost_after_billing" });
    expect(costAfterBillingSignals(money("a"), TODAY)).toEqual([]);
    expect(costAfterBillingSignals(money("a", { supplierInvoices: null }), TODAY)).toEqual([]);
  });

  it("says it for 30 days after the invoice was booked: then the tag clears by itself", () => {
    // 19 Oct is 30 days before 18 Nov; 18 Oct is 31.
    expect(of(invoice({ bookedOn: "2026-10-19" }))).toHaveLength(1);
    expect(of(invoice({ bookedOn: "2026-10-18" }))).toEqual([]);
    expect(of(invoice({ bookedOn: TODAY }))).toHaveLength(1);
    // With no day it was booked on it cannot be bounded: not said.
    expect(of(invoice({ bookedOn: "" }))).toEqual([]);
    // An old one beside a new one: only the new one is in the tag.
    expect(words(of(invoice({ bookedOn: "2026-09-01", supplier: "CMA" }), invoice({ bookedOn: "2026-11-10" })))).toEqual([["URGENT", "Supplier invoice after billing, above estimate · Maersk 12,400.00 CZK · booked 10.11."]]);
  });

  it("gives one tag of each, naming two of the invoices, counting the rest, with the day the latest was booked", () => {
    const signals = of(invoice({ bookedOn: "2026-11-02" }), invoice({ supplier: "", number: "FV-78", currency: "EUR", amount: 300, bookedOn: "2026-11-16" }), invoice({ supplier: "CMA" }), invoice({ supplier: "DSV", aboveEstimate: false }));
    expect(words(signals)).toEqual([
      ["URGENT", "3 supplier invoices after billing, above estimate · Maersk 12,400.00 CZK; FV-78 300.00 EUR; and 1 more · the latest booked 16.11."],
      ["ATTENTION", "Supplier invoice after billing · DSV 12,400.00 CZK · booked 14.11."],
    ]);
  });

  it("reads an invoice that bills in two currencies as one invoice, each amount in its own currency", () => {
    const signals = of(invoice({ id: "si-two" }), invoice({ id: "si-two", currency: "EUR", amount: 300 }));
    expect(words(signals)).toEqual([["URGENT", "Supplier invoice after billing, above estimate · Maersk 12,400.00 CZK, 300.00 EUR · booked 14.11."]]);
  });
});

describe("estimates with no supplier invoice", () => {
  const arrived = (actualArrival: string | null) => ({ tradeDirection: "Import", department: "", actualArrival, actualDeparture: null, actualDeliveryDate: null });
  const open = () => money("a", { estimatesOpen: { lines: 3, oldestSince: "2026-10-14", amounts: [eur(900)] } });

  it("is ATTENTION 30 days after the tax date and URGENT at 60", () => {
    expect(accrualSignals(arrived("2026-10-20"), open(), TODAY, false)).toEqual([]);
    expect(words(accrualSignals(arrived("2026-10-19"), open(), TODAY, false))).toEqual([["ATTENTION", "3 estimates with no supplier invoice · since 14.10."]]);
    expect(accrualSignals(arrived("2026-10-19"), open(), TODAY, false)[0]).toMatchObject({ rank: MONEY_RANK.accrual, kind: "accrual" });
    expect(words(accrualSignals(arrived("2026-09-20"), open(), TODAY, false))).toEqual([["ATTENTION", "3 estimates with no supplier invoice · since 14.10."]]);
    expect(words(accrualSignals(arrived("2026-09-19"), open(), TODAY, false))).toEqual([["URGENT", "3 estimates with no supplier invoice · since 14.10."]]);
    expect(accrualSignals(arrived("2026-09-19"), open(), TODAY, false)[0]).toMatchObject({ rank: MONEY_RANK.accrualLate, kind: "accrual" });
  });

  it("is URGENT once the job is billed, whatever its tax date - and an invoice that merely exists does not make it so", () => {
    expect(words(accrualSignals(arrived("2026-11-17"), open(), TODAY, true))).toEqual([["URGENT", "3 estimates with no supplier invoice · since 14.10."]]);
    expect(words(accrualSignals(arrived(null), open(), TODAY, true))).toEqual([["URGENT", "3 estimates with no supplier invoice · since 14.10."]]);
    // Invoiced in advance, not departed, not in Billing: its estimates are no matter yet.
    const advance = jobMoneyOf(answered("a", { invoicedOn: "2026-11-10", estimatesOpen: { lines: 3, oldestSince: "2026-10-14", amounts: [] } }), true);
    expect(accrualSignals(arrived(null), advance, TODAY, isBilled(BOOKED, false))).toEqual([]);
    expect(accrualSignals(arrived(null), advance, TODAY, isBilled(BILLING, false))).toHaveLength(1);
  });

  it("says nothing before the tax date, or with no estimate open - and one estimate is one", () => {
    expect(accrualSignals(arrived(null), open(), TODAY, false)).toEqual([]);
    expect(accrualSignals(arrived("2026-09-01"), money("a"), TODAY, true)).toEqual([]);
    const one = money("a", { estimatesOpen: { lines: 1, oldestSince: null, amounts: [] } });
    expect(words(accrualSignals(arrived("2026-10-01"), one, TODAY, false))).toEqual([["ATTENTION", "1 estimate with no supplier invoice"]]);
  });
});

describe("supplier invoices", () => {
  const of = (supplierInvoices: Partial<InvoicingSupplierInvoices>, holidays: string[] = []) => words(supplierInvoiceSignals(money("a", { supplierInvoices }), NOW, holidays));

  it("says those waiting for approval for more than 2 working days, by the day or the moment the oldest waits since", () => {
    // Since Thursday the 12th: Friday, Monday, Wednesday - three working days.
    expect(of({ toApprove: 2, oldestWaitingSince: "2026-11-12" })).toEqual([["ATTENTION", "2 supplier invoices to approve since 12.11."]]);
    expect(of({ toApprove: 1, oldestWaitingSince: "2026-11-12" })).toEqual([["ATTENTION", "1 supplier invoice to approve since 12.11."]]);
    // Since Friday the 13th: Monday and Wednesday - two, not more.
    expect(of({ toApprove: 2, oldestWaitingSince: "2026-11-13" })).toEqual([]);
    expect(of({ toApprove: 2, oldestWaitingSince: "2026-11-12" }, ["2026-11-16"])).toEqual([]);
    // A moment: to the minute.
    expect(of({ toApprove: 2, oldestWaitingSince: at("2026-11-13", "10:59").toISOString() })).toEqual([["ATTENTION", "2 supplier invoices to approve since 13.11."]]);
    expect(of({ toApprove: 2, oldestWaitingSince: at("2026-11-13", "11:00").toISOString() })).toEqual([]);
    // No day to count from: its age is not known, so nothing is said.
    expect(of({ toApprove: 2, oldestWaitingSince: null })).toEqual([]);
    expect(of({ toApprove: 0, oldestWaitingSince: "2026-11-01" })).toEqual([]);
  });

  it("says a refused one only for 14 days after the last was refused - and not at all without that day", () => {
    // 4 Nov is 14 days before 18 Nov; 3 Nov is 15.
    expect(of({ refused: 1, lastRefusedOn: "2026-11-04" })).toEqual([["ATTENTION", "Supplier invoice refused"]]);
    expect(of({ refused: 1, lastRefusedOn: "2026-11-03" })).toEqual([]);
    expect(of({ refused: 3, lastRefusedOn: TODAY })).toEqual([["ATTENTION", "3 supplier invoices refused"]]);
    expect(of({ refused: 1, lastRefusedOn: null })).toEqual([]);
    expect(of({ refused: 0, lastRefusedOn: TODAY })).toEqual([]);
  });

  it("says one refused or claimed, and is URGENT for one approved and overdue", () => {
    expect(of({ refused: 1, lastRefusedOn: "2026-11-17" })).toEqual([["ATTENTION", "Supplier invoice refused"]]);
    expect(of({ claimed: 1 })).toEqual([["ATTENTION", "Supplier invoice claimed"]]);
    expect(of({ approvedOverdue: 1 })).toEqual([["URGENT", "Supplier invoice approved, overdue"]]);
    expect(of({ refused: 2, lastRefusedOn: "2026-11-17", claimed: 3, approvedOverdue: 2, toApprove: 1, oldestWaitingSince: "2026-11-02" })).toEqual([
      ["URGENT", "2 supplier invoices approved, overdue"],
      ["ATTENTION", "1 supplier invoice to approve since 02.11."],
      ["ATTENTION", "2 supplier invoices refused"],
      ["ATTENTION", "3 supplier invoices claimed"],
    ]);
    const all = supplierInvoiceSignals(money("a", { supplierInvoices: { refused: 1, lastRefusedOn: "2026-11-17", claimed: 1, approvedOverdue: 1, toApprove: 1, oldestWaitingSince: "2026-11-02" } }), NOW, []);
    expect(all.map((s) => [s.rank, s.kind])).toEqual([
      [MONEY_RANK.supplierInvoiceOverdue, "supplier_invoice"],
      [MONEY_RANK.supplierInvoiceToApprove, "supplier_invoice"],
      [MONEY_RANK.supplierInvoiceRefused, "supplier_invoice"],
      [MONEY_RANK.supplierInvoiceClaimed, "supplier_invoice"],
    ]);
  });
});

describe("Invoicing's answer", () => {
  it("is read by Invoicing's own types: a field renamed or made nullable there stops the typecheck here", () => {
    const read = (theirs: OperationsMoney): InvoicingMoney => theirs;
    const dates = (ours: InvoicingJobDates): OperationsMoneyJobDates => ours;
    expect(read({ jobs: [], unreadable: [], notKnown: [], invoicesRead: true })).toEqual({ jobs: [], unreadable: [], notKnown: [], invoicesRead: true });
    expect(dates({ shipmentId: "a", tradeDirection: "Import", estimatedArrival: null, estimatedDeparture: null, actualArrival: null, actualDeparture: null }).shipmentId).toBe("a");
  });
});

describe("what Invoicing could not read", () => {
  it("reads Invoicing's answer of a job as it is when everything was read", () => {
    const job = answered("a", { notYetInvoiced: [eur(10)], untickedSelling: [eur(4)], invoicedOn: "2026-11-10", notRecharged: [{ code: "DET", label: "Detention", currency: "EUR", amount: 5 }] });
    expect(jobMoneyOf(job, true)).toEqual({
      notYetInvoiced: [eur(10)],
      untickedSelling: [eur(4)],
      sellingLines: 2,
      costLines: 2,
      totals: QUIET_TOTALS,
      invoicesRead: true,
      notRecharged: [{ code: "DET", label: "Detention", currency: "EUR", amount: 5 }],
      supplierInvoices: QUIET_INVOICES,
      estimatesOpen: { lines: 0, oldestSince: null, amounts: [] },
    });
  });

  it("makes of the customer invoices that were not read no fact at all: the work not yet invoiced is not known - not none", () => {
    const m = jobMoneyOf(answered("a", { notYetInvoiced: [], invoicedOn: null }), false);
    expect(m).toMatchObject({ notYetInvoiced: null, untickedSelling: null, invoicesRead: false, sellingLines: 2 });
    // A job in Billing for weeks: nobody can say what of it is not invoiced.
    expect(inBillingSignals(BILLING, m, at("2026-11-02"), NOW, [])).toEqual([]);
    expect(untickedSignals(BILLING, m)).toEqual([]);
    const arrived = { tradeDirection: "Import", department: "", status: "Arrived [IMP]", actualArrival: "2026-10-01", actualDeparture: null, actualDeliveryDate: null };
    expect(notInvoicedSignals(arrived, m, TODAY)).toEqual([]);
    // The margin and the estimates do not hang on the invoices: they are judged all the same.
    expect(words(marginSignals({ ...m, totals: { ...QUIET_TOTALS, profitCzk: -500, marginPct: -1 } }, true))).toEqual([["URGENT", "Loss −500 CZK"]]);
    expect(words(accrualSignals(arrived, { ...m, estimatesOpen: { lines: 1, oldestSince: null, amounts: [] } }, TODAY, false))).toEqual([["ATTENTION", "1 estimate with no supplier invoice"]]);
  });

  it("makes of the lines that were not read no margin, no amount and nothing not recharged - and no job whose margin is 'not known' for a rate", () => {
    const totals = { sellingCzk: null, estimateCzk: null, realCzk: null, estimateOfRealCzk: null, realOfEstimatedCzk: null, costCzk: null, profitCzk: null, marginPct: null, missingCurrencies: [], ratesNote: "" as const };
    const m = jobMoneyOf(answered("a", { sellingLines: null, costLines: null, totals }), true);
    expect(m).toMatchObject({ notYetInvoiced: null, untickedSelling: null, notRecharged: null, sellingLines: null, costLines: null });
    expect(marginSignals(m, true)).toEqual([]);
    expect(isMarginNotKnown(m)).toBe(false);
    expect(notRechargedSignals(m)).toEqual([]);
  });

  it("gives no supplier-invoice or estimate signal for a part that is null, and none for a count that is", () => {
    const m = jobMoneyOf(answered("a", { supplierInvoices: null, estimatesOpen: null, invoicedOn: "2026-11-01" }), true);
    expect(supplierInvoiceSignals(m, NOW, [])).toEqual([]);
    expect(costAfterBillingSignals(m, TODAY)).toEqual([]);
    expect(accrualSignals({ tradeDirection: "Import", department: "", actualArrival: "2026-01-01", actualDeparture: null, actualDeliveryDate: null }, m, TODAY, true)).toEqual([]);
    const counts = money("a", { supplierInvoices: { refused: 1, lastRefusedOn: "2026-11-17", claimed: null, approvedOverdue: null } });
    expect(words(supplierInvoiceSignals(counts, NOW, []))).toEqual([["ATTENTION", "Supplier invoice refused"]]);
  });
});

describe("cost claims", () => {
  const claim = (day: string, over: Partial<MoneyClaim> = {}): MoneyClaim => ({ createdAt: at(day), amount: 240, currency: "EUR", ...over });

  it("says an open cost claim older than 30 days, and is URGENT for one older than 60", () => {
    expect(costClaimSignals([claim("2026-10-19")], TODAY)).toEqual([]);
    expect(words(costClaimSignals([claim("2026-10-18")], TODAY))).toEqual([["ATTENTION", "Cost claim open since 18.10. · 240.00 EUR"]]);
    expect(costClaimSignals([claim("2026-10-18")], TODAY)[0]).toMatchObject({ rank: MONEY_RANK.costClaim, kind: "cost_claim" });
    expect(words(costClaimSignals([claim("2026-09-19")], TODAY))).toEqual([["ATTENTION", "Cost claim open since 19.09. · 240.00 EUR"]]);
    expect(words(costClaimSignals([claim("2026-09-18")], TODAY))).toEqual([["URGENT", "Cost claim open since 18.09. · 240.00 EUR"]]);
    expect(costClaimSignals([claim("2026-09-18")], TODAY)[0]).toMatchObject({ rank: MONEY_RANK.costClaimOld, kind: "cost_claim" });
    expect(costClaimSignals([], TODAY)).toEqual([]);
  });

  it("gives one tag for the old ones, with what they claim per currency; a young one is not in it", () => {
    const claims = [claim("2026-09-01"), claim("2026-10-01", { amount: 100 }), claim("2026-10-02", { amount: 5000, currency: "CZK" }), claim("2026-10-03", { amount: null, currency: "" }), claim("2026-11-10", { amount: 999 })];
    expect(words(costClaimSignals(claims, TODAY))).toEqual([["URGENT", "4 cost claims open, the oldest since 01.09. · 5,000.00 CZK, 340.00 EUR"]]);
    expect(words(costClaimSignals([claim("2026-10-01", { amount: null, currency: "" })], TODAY))).toEqual([["ATTENTION", "Cost claim open since 01.10."]]);
  });

  it("reads the claims by job and leaves out a row nobody filled in", () => {
    const row = (over: Partial<OpenCostClaimRow> = {}): OpenCostClaimRow => ({ shipmentId: "a", createdAt: at("2026-10-01"), claimAmount: null, claimCurrency: "", supplierInvoiceId: null, supplier: "", invoiceNumber: "", reason: "", amount: "", note: "", ...over });
    const byJob = moneyClaimsOf([row(), row({ claimAmount: "120.50", claimCurrency: "eur" }), row({ shipmentId: "b", reason: "Overcharged" }), row({ shipmentId: "b", supplierInvoiceId: "si-1" }), row({ shipmentId: "c", note: " " })]);
    expect([...byJob.keys()]).toEqual(["a", "b"]);
    expect(byJob.get("a")).toEqual([{ createdAt: at("2026-10-01"), amount: 120.5, currency: "EUR" }]);
    expect(byJob.get("b")).toEqual([
      { createdAt: at("2026-10-01"), amount: null, currency: "" },
      { createdAt: at("2026-10-01"), amount: null, currency: "" },
    ]);
  });
});

describe("the customer's credit", () => {
  const credit = (over: Partial<CustomerCredit> = {}): CustomerCredit => ({ creditLimit: 100_000, currency: "CZK", unpaid: [], overdueCount: 0, ...over });
  const RATES = { EUR: 25, USD: 22 };

  it("compares what is owed in the limit's own currency as it is, with no rate", () => {
    expect(overLimit(credit({ unpaid: [czk(100_000.01)] }), null)).toBe("over");
    expect(overLimit(credit({ unpaid: [czk(100_000)] }), null)).toBe("not_over");
    expect(overLimit(credit({ currency: "EUR", creditLimit: 5000, unpaid: [eur(3000), eur(2500)] }), null)).toBe("over");
    expect(overLimit(credit({ unpaid: [] }), null)).toBe("not_over");
    // No limit set: nothing to be over.
    expect(overLimit(credit({ creditLimit: 0, unpaid: [eur(1_000_000)] }), null)).toBe("not_over");
    expect(needsRates(credit({ unpaid: [czk(5)] }))).toBe(false);
    expect(needsRates(credit({ unpaid: [eur(5)] }))).toBe(true);
    expect(needsRates(credit({ creditLimit: 0, unpaid: [eur(5)] }))).toBe(false);
  });

  it("compares other currencies through CZK at today's rates - and says not known, never fine, where a rate is missing", () => {
    expect(overLimit(credit({ unpaid: [eur(4000), czk(1)] }), RATES)).toBe("over");
    expect(overLimit(credit({ unpaid: [eur(4000)] }), RATES)).toBe("not_over");
    expect(overLimit(credit({ currency: "EUR", creditLimit: 4000, unpaid: [czk(100_001)] }), RATES)).toBe("over");
    // No rates at all, the limit's currency without one, an owed currency without one.
    expect(overLimit(credit({ unpaid: [eur(4000)] }), null)).toBe("not_known");
    expect(overLimit(credit({ currency: "GBP", unpaid: [eur(4000)] }), RATES)).toBe("not_known");
    expect(overLimit(credit({ unpaid: [eur(100), { currency: "GBP", amount: 5 }] }), RATES)).toBe("not_known");
    // What can be converted is over the limit already: the rest can only add to it…
    expect(overLimit(credit({ unpaid: [eur(5000), { currency: "GBP", amount: 5 }] }), RATES)).toBe("over");
    // …unless what is left out is a credit.
    expect(overLimit(credit({ unpaid: [eur(5000), { currency: "GBP", amount: -5 }] }), RATES)).toBe("not_known");
  });

  it("is due for a release decision once the job has arrived and is neither released nor delivered", () => {
    const j = { actualArrival: "2026-11-15", houseBolRelease: "", warehouseReleasedDate: null, actualDeliveryDate: null };
    expect(releaseDue(j)).toBe(true);
    expect(releaseDue({ ...j, actualArrival: null })).toBe(false);
    expect(releaseDue({ ...j, houseBolRelease: "jan@firma.cz 16.11.2026" })).toBe(false);
    expect(releaseDue({ ...j, warehouseReleasedDate: "2026-11-16" })).toBe(false);
    expect(releaseDue({ ...j, actualDeliveryDate: "2026-11-17" })).toBe(false);
  });

  it("says over limit and overdue invoices: ATTENTION, URGENT when a release decision is due", () => {
    const sailing = { actualArrival: null, houseBolRelease: "", warehouseReleasedDate: null, actualDeliveryDate: null };
    const arrived = { ...sailing, actualArrival: "2026-11-15" };
    const both = creditSignals(sailing, { over: "over", overdue: 2 });
    expect(words(both)).toEqual([
      ["ATTENTION", "Customer over limit"],
      ["ATTENTION", "Customer has overdue invoices · 2"],
    ]);
    expect(both.map((s) => [s.rank, s.kind])).toEqual([
      [MONEY_RANK.creditOverLimit, "credit"],
      [MONEY_RANK.creditOverdue, "credit"],
    ]);
    const due = creditSignals(arrived, { over: "over", overdue: 2 });
    expect(words(due)).toEqual([
      ["URGENT", "Customer over limit"],
      ["URGENT", "Customer has overdue invoices · 2"],
    ]);
    expect(due.map((s) => s.rank)).toEqual([MONEY_RANK.creditReleaseDue, MONEY_RANK.creditReleaseDue]);
    expect(words(creditSignals(arrived, { over: "not_over", overdue: 1 }))).toEqual([["URGENT", "Customer has overdue invoices · 1"]]);
  });

  it("says nothing of a limit that could not be compared, a customer in order, or a job whose credit is not known", () => {
    const arrived = { actualArrival: "2026-11-15", houseBolRelease: "", warehouseReleasedDate: null, actualDeliveryDate: null };
    expect(creditSignals(arrived, { over: "not_known", overdue: 0 })).toEqual([]);
    expect(creditSignals(arrived, { over: "not_over", overdue: 0 })).toEqual([]);
    expect(creditSignals(arrived, null)).toEqual([]);
  });
});

describe("not recharged", () => {
  it("says what was bought of demurrage, detention, storage or waiting and not sold on: one tag per kind, per currency", () => {
    const signals = notRechargedSignals(
      money("a", {
        notRecharged: [
          { code: "DET", label: "Detention", currency: "EUR", amount: 240 },
          { code: "DET", label: "Detention", currency: "EUR", amount: 60 },
          { code: "DET", label: "Detention", currency: "USD", amount: 100 },
          { code: "STO", label: "Storage", currency: "CZK", amount: 1500 },
          { code: "WAI", label: "", currency: "CZK", amount: 0 },
        ],
      }),
    );
    expect(words(signals)).toEqual([
      ["ATTENTION", "Detention bought, not sold on · 300.00 EUR, 100.00 USD"],
      ["ATTENTION", "Storage bought, not sold on · 1,500.00 CZK"],
    ]);
    expect(signals[0]).toMatchObject({ rank: MONEY_RANK.notRecharged, kind: "not_recharged" });
    expect(notRechargedSignals(money("a"))).toEqual([]);
  });
});

describe("the ranks", () => {
  it("keeps the URGENT money signals within 20-29 and the ATTENTION ones within 300-399", () => {
    const urgentKeys = ["creditReleaseDue", "loss", "costAfterBillingAbove", "supplierInvoiceOverdue", "notInvoicedLate", "accrualLate", "costClaimOld"];
    for (const [key, rank] of Object.entries(MONEY_RANK)) {
      if (urgentKeys.includes(key)) expect(rank >= 20 && rank <= 29, key).toBe(true);
      else expect(rank >= 300 && rank <= 399, key).toBe(true);
    }
  });
});

describe("one job's money signals", () => {
  const input = (over: Partial<Parameters<typeof moneySignals>[1]> = {}): Parameters<typeof moneySignals>[1] => ({
    invoicing: new Map(),
    invoicedIds: new Set(),
    customerOf: new Map(),
    credit: new Map(),
    creditRates: null,
    claims: new Map(),
    statusChangedAt: new Map(),
    holidays: [],
    now: NOW,
    ...over,
  });

  it("gives none of Invoicing's signals for a job Invoicing did not answer - the others still speak", () => {
    const j = job({ status: "Billing [IMP]", actualArrival: "2026-11-15" });
    const signals = moneySignals(j, input({ invoicing: null, claims: new Map([[j.id, [{ createdAt: at("2026-09-01"), amount: 240, currency: "EUR" }]]]), customerOf: new Map([[j.id, "c-1"]]), credit: new Map([["c-1", { creditLimit: 0, currency: "CZK", unpaid: [], overdueCount: 2 }]]) }));
    expect(words(signals)).toEqual([
      ["URGENT", "Cost claim open since 01.09. · 240.00 EUR"],
      ["URGENT", "Customer has overdue invoices · 2"],
    ]);
    expect(moneySignals(j, input())).toEqual([]);
  });

  it("gives no credit tag to a job with no linked customer, one whose customer was not found, or when the credit could not be read", () => {
    const j = job({ actualArrival: "2026-11-15" });
    const owing = new Map([["c-1", { creditLimit: 0, currency: "CZK", unpaid: [], overdueCount: 2 }]]);
    expect(moneySignals(j, input({ customerOf: new Map([[j.id, null]]), credit: owing }))).toEqual([]);
    expect(moneySignals(j, input({ customerOf: new Map([[j.id, "c-9"]]), credit: owing }))).toEqual([]);
    expect(moneySignals(j, input({ customerOf: new Map([[j.id, "c-1"]]), credit: null }))).toEqual([]);
    expect(moneySignals(j, input({ customerOf: null, credit: owing }))).toEqual([]);
    expect(moneySignals(j, input({ customerOf: new Map([[j.id, "c-1"]]), credit: owing }))).toHaveLength(1);
  });

  it("gives no In Billing tag when the history could not be read; with it, a status that never changed counts from the job's creation", () => {
    const j = job({ status: "Billing [IMP]", createdAt: at("2026-11-02") });
    const invoicing = facts(money(j.id, { notYetInvoiced: [eur(5000)] }));
    expect(moneySignals(j, input({ invoicing, statusChangedAt: null }))).toEqual([]);
    expect(words(moneySignals(j, input({ invoicing })))).toEqual([["ATTENTION", "In Billing since 02.11., 5,000.00 EUR not invoiced · with Invoicing"]]);
    expect(words(moneySignals(j, input({ invoicing, statusChangedAt: new Map([[j.id, changed("2026-11-10")]]) })))).toEqual([["ATTENTION", "In Billing since 10.11., 5,000.00 EUR not invoiced · with Invoicing"]]);
    // Two working days are not over; and a last change that set another status says nothing.
    expect(moneySignals(j, input({ invoicing, statusChangedAt: new Map([[j.id, changed("2026-11-16")]]) }))).toEqual([]);
    expect(moneySignals(j, input({ invoicing, statusChangedAt: new Map([[j.id, changed("2026-11-10", "Arrived [IMP]")]]) }))).toEqual([]);
  });

  it("reads 'billed' off the job for an active one: an open invoice alone makes neither a loss URGENT nor the estimates", () => {
    // Invoiced in advance: an open invoice, not departed, not in Billing.
    const advance = jobMoneyOf(answered("x", { invoicedOn: "2026-11-10", estimatesOpen: { lines: 2, oldestSince: "2026-11-01", amounts: [] }, totals: { ...answered("x").totals, profitCzk: -640, marginPct: -3.2 } }), true);
    const booked = job({ status: "Booked [IMP]" });
    expect(words(moneySignals(booked, input({ invoicing: new Map([[booked.id, advance]]) })))).toEqual([["ATTENTION", "Margin −3.2 % · profit −640 CZK"]]);
    const billing = job({ status: "Billing [IMP]", createdAt: at("2026-11-18", "09:00") });
    expect(words(moneySignals(billing, input({ invoicing: new Map([[billing.id, advance]]) })))).toEqual([
      ["URGENT", "Loss −640 CZK"],
      ["URGENT", "2 estimates with no supplier invoice · since 01.11."],
    ]);
  });
});

describe("the Money tab", () => {
  it("answers a company with nothing to say with every family at 0, none of them unread, and empty cards", () => {
    const a = answer([job(), job()]);
    expect(a).toMatchObject({ asOf: NOW.toISOString(), today: TODAY, mode: "all", direction: "all", handledBy: null, reports: "all", capped: false, holidaysKnown: true, notKnown: [] });
    expect(a.tiles).toEqual({
      notYetInvoiced: [],
      notYetInvoicedCzk: { amount: 0, label: "" },
      notYetInvoicedJobs: 0,
      signals: Object.fromEntries(MONEY_SIGNAL_KINDS.map((k) => [k, 0])),
      signalsNotKnown: [],
      marginNotKnown: 0,
    });
    expect(a.urgent).toEqual({ total: 0, rows: [] });
    expect(a.attention).toEqual({ total: 0, rows: [] });
    expect(a.people).toEqual([person("jan@firma.cz", { active: 2 })]);
  });

  it("gives one row per job with all its money tags, the urgent ones first: URGENT when any is urgent", () => {
    const loss = job({ status: "Billing [IMP]", holidayCover: " eva@firma.cz ", personInCharge: " jan@firma.cz " });
    const thin = job({ freightMode: "Air Freight", tradeDirection: "Export" });
    const fine = job();
    const a = answer([loss, thin, fine], {
      invoicing: facts(
        money(loss.id, { totals: { profitCzk: -4210, marginPct: -8 }, untickedSelling: [eur(320)], supplierInvoices: { refused: 1, lastRefusedOn: "2026-11-16" } }),
        money(thin.id, { totals: { profitCzk: 640, marginPct: 3.2 } }),
        money(fine.id),
      ),
      statusChangedAt: new Map([[loss.id, changed("2026-11-17")]]),
    });
    expect(a.urgent).toEqual({
      total: 1,
      rows: [
        {
          id: loss.id,
          jobNumber: loss.jobNumber,
          customer: "ACME s.r.o.",
          mode: "sea",
          tradeDirection: "Import",
          status: "Billing [IMP]",
          handledBy: "jan@firma.cz",
          holidayCover: "eva@firma.cz",
          invoiced: false,
          tags: [
            { text: "Loss −4,210 CZK", urgent: true, kind: "margin" },
            { text: "Selling line not ticked · 320.00 EUR: holds the job open", urgent: false, kind: "unticked" },
            { text: "Supplier invoice refused", urgent: false, kind: "supplier_invoice" },
          ],
        },
      ],
    });
    expect(a.attention.rows.map((r) => [r.jobNumber, r.mode, r.tags])).toEqual([[thin.jobNumber, "air", [{ text: "Margin 3.2 % · profit 640 CZK", urgent: false, kind: "margin" }]]]);
    // A tile counts the rows carrying a tag of its family, whichever card they are on.
    expect(a.tiles.signals).toMatchObject({ margin: 2, unticked: 1, supplier_invoice: 1, not_invoiced: 0, credit: 0 });
  });

  it("orders a card by its most pressing signal, then by job number, and cuts its list at 200 while the total counts all", () => {
    const jobs = Array.from({ length: COCKPIT_LIST_LIMIT + 5 }, () => job({ status: "Billing [IMP]" }));
    const late = job({ actualArrival: "2026-11-15" });
    const a = answer([...jobs, late], {
      invoicing: facts(...jobs.map((j) => money(j.id, LOSS)), money(late.id)),
      customerOf: new Map([[late.id, "c-1"]]),
      credit: new Map([["c-1", { creditLimit: 0, currency: "CZK", unpaid: [], overdueCount: 1 }]]),
    });
    expect(a.urgent.total).toBe(COCKPIT_LIST_LIMIT + 6);
    expect(a.urgent.rows).toHaveLength(COCKPIT_LIST_LIMIT);
    // The release that is due comes before the losses, though its job number is the last.
    expect(a.urgent.rows[0]!.jobNumber).toBe(late.jobNumber);
    expect(a.urgent.rows.slice(1, 4).map((r) => r.jobNumber)).toEqual(jobs.slice(0, 3).map((j) => j.jobNumber));
    expect(a.tiles.signals).toMatchObject({ margin: COCKPIT_LIST_LIMIT + 5, credit: 1 });
  });

  it("says a job in Billing with one open invoice and lines on none - on the card and in the tile", () => {
    const j = job({ status: "Billing [IMP]" });
    const a = answer([j], { invoicing: facts(money(j.id, { notYetInvoiced: [eur(5000)] })), statusChangedAt: new Map([[j.id, changed("2026-10-25")]]) });
    expect(a.attention.rows.map((r) => r.tags)).toEqual([[{ text: "In Billing since 25.10., 5,000.00 EUR not invoiced · with Invoicing", urgent: false, kind: "not_invoiced" }]]);
    expect(a.tiles).toMatchObject({ notYetInvoiced: [eur(5000)], notYetInvoicedJobs: 1, signals: { not_invoiced: 1 } });
  });

  it("sums the work not yet invoiced per currency, never across, and counts its jobs", () => {
    // 5,000 CZK + 1,450.30 EUR at 25 + 70 USD at 22.
    const [a1, a2, a3] = [job(), job(), job()];
    const a = answer([a1, a2, a3], {
      invoicing: facts(money(a1.id, { notYetInvoiced: [eur(1000.1), czk(5000)] }), money(a2.id, { notYetInvoiced: [eur(450.2), { currency: "USD", amount: 70 }] }), money(a3.id, { notYetInvoiced: [eur(0)] })),
    });
    expect(a.tiles.notYetInvoiced).toEqual([czk(5000), eur(1450.3), { currency: "USD", amount: 70 }]);
    expect(a.tiles.notYetInvoicedJobs).toBe(2);
    // The one place they are added: in CZK, at the rates of the day, labelled.
    expect(a.tiles.notYetInvoicedCzk).toEqual({ amount: 42_797.5, label: LABEL });
    expect(a.notKnown).toEqual([]);
    expect(a.people[0]!.notYetInvoiced).toEqual([czk(5000), eur(1450.3), { currency: "USD", amount: 70 }]);
  });

  it("gives the one CZK total at today's rates with its label - and none, naming the currencies, when one has no rate", () => {
    const [a1, a2, a3] = [job(), job(), job({ personInCharge: "eva@firma.cz" })];
    const invoicing = facts(money(a1.id, { notYetInvoiced: [eur(100)] }), money(a2.id, { notYetInvoiced: [czk(500)] }), money(a3.id, { notYetInvoiced: [{ currency: "USD", amount: 10 }] }));
    const rated = answer([a1, a2, a3], { invoicing, czk: { rates: { EUR: 25, USD: 22 }, label: LABEL } });
    expect(rated.tiles.notYetInvoicedCzk).toEqual({ amount: 3220, label: LABEL });
    expect(rated.tiles.notYetInvoiced).toEqual([czk(500), eur(100), { currency: "USD", amount: 10 }]);
    expect(rated.notKnown).toEqual([]);
    const partly = answer([a1, a2, a3], { invoicing, czk: { rates: { EUR: 25 }, label: LABEL } });
    expect(partly.tiles.notYetInvoicedCzk).toBeNull();
    // The chips per currency stand alone.
    expect(partly.tiles.notYetInvoiced).toEqual([czk(500), eur(100), { currency: "USD", amount: 10 }]);
    expect(partly.notKnown).toEqual(["the CZK total of work not yet invoiced: no ČNB rate for USD"]);
    expect(answer([a1, a2, a3], { invoicing, czk: { rates: {}, label: LABEL } }).notKnown).toEqual(["the CZK total of work not yet invoiced: no ČNB rate for EUR, USD"]);
    // The total is of the jobs counted: narrowed to Jan, the dollar job is not in it and nothing is missing.
    const jan = answer([a1, a2, a3], { invoicing, czk: { rates: { EUR: 25 }, label: LABEL }, handledBy: "jan@firma.cz" });
    expect(jan.tiles.notYetInvoicedCzk).toEqual({ amount: 3000, label: LABEL });
    expect(jan.notKnown).toEqual([]);
    // All in CZK: no rate needed, none named - whatever the sheet holds.
    expect(answer([a2], { invoicing, czk: { rates: {}, label: LABEL } }).tiles.notYetInvoicedCzk).toEqual({ amount: 500, label: "" });
    expect(answer([a2], { invoicing }).tiles.notYetInvoicedCzk).toEqual({ amount: 500, label: "" });
  });

  it("counts the jobs whose margin is not known, gives them no margin tag, and says why in Invoicing's own terms", () => {
    const noMargin = (ratesNote: JobMoney["totals"]["ratesNote"]) => ({ totals: { profitCzk: null, marginPct: null, estimateOfRealCzk: null, realOfEstimatedCzk: null, ratesNote, missingCurrencies: ["USD"] } });
    const jobs = Array.from({ length: 6 }, (_, i) => job({ status: "Billing [IMP]", personInCharge: i === 5 ? "eva@firma.cz" : "jan@firma.cz" }));
    const [known, missing1, missing2, notFixed, unreadable, evas] = jobs;
    const invoicing = facts(money(known!.id), money(missing1!.id, noMargin("missing")), money(missing2!.id, noMargin("missing")), money(notFixed!.id, noMargin("not_fixed")), money(unreadable!.id, noMargin("unreadable")), money(evas!.id, noMargin("missing")));
    const a = answer(jobs, { invoicing });
    expect(a.tiles.marginNotKnown).toBe(5);
    expect(a.tiles.signals.margin).toBe(0);
    // The family was judged - for the job whose rates are known: it is not among the unread ones.
    expect(a.tiles.signalsNotKnown).toEqual([]);
    expect(a.urgent.total + a.attention.total).toBe(0);
    expect(a.notKnown).toEqual(["margin of 3 jobs: a ČNB rate is missing", "margin of 2 jobs: their rates are not fixed yet and could not be read"]);
    // Of the jobs counted: narrowed to Eva, hers alone.
    const eva = answer(jobs, { invoicing, handledBy: "eva@firma.cz" });
    expect(eva.tiles.marginNotKnown).toBe(1);
    expect(eva.notKnown).toEqual(["margin of 1 job: a ČNB rate is missing"]);
  });

  it("says of a job that reads Invoiced only what is about invoiced jobs: a loss, costs after billing, estimates, supplier invoices, cost claims, what was not recharged", () => {
    const closed = job({ status: "Arrived [IMP]", actualArrival: "2026-11-01", personInCharge: "eva@firma.cz" });
    const everything = money(closed.id, {
      totals: { profitCzk: -4210, marginPct: -8, estimateOfRealCzk: 10_000, realOfEstimatedCzk: 20_000 },
      // What Invoicing would say of it were it active: none of this is said of an invoiced job.
      notYetInvoiced: [eur(999)],
      untickedSelling: [eur(320)],
      sellingLines: 0,
      costLines: 3,
      estimatesOpen: { lines: 2, oldestSince: "2026-11-02", amounts: [] },
      notRecharged: [{ code: "DET", label: "Detention", currency: "EUR", amount: 240 }],
      supplierInvoices: { toApprove: 1, oldestWaitingSince: "2026-11-02", refused: 1, lastRefusedOn: "2026-11-17", afterBilling: [{ id: "si-1", number: "FV-1", supplier: "Maersk", currency: "CZK", amount: 12_400, aboveEstimate: true, bookedOn: "2026-11-14" }] },
    });
    const a = answer([closed], {
      invoicedIds: new Set([closed.id]),
      invoicing: facts(everything),
      customerOf: new Map([[closed.id, "c-1"]]),
      credit: new Map([["c-1", { creditLimit: 1, currency: "CZK", unpaid: [czk(5)], overdueCount: 3 }]]),
      claims: new Map([[closed.id, [{ createdAt: at("2026-10-01"), amount: 240, currency: "EUR" }]]]),
    });
    expect(a.urgent.rows).toHaveLength(1);
    expect(a.urgent.rows[0]).toMatchObject({ jobNumber: closed.jobNumber, invoiced: true, status: "Arrived [IMP]" });
    expect(a.urgent.rows[0]!.tags.map((t) => [t.urgent, t.kind, t.text])).toEqual([
      // It reads Invoiced: billed, whatever its status - the loss and the estimates are URGENT at once.
      [true, "margin", "Loss −4,210 CZK"],
      [true, "cost_after_billing", "Supplier invoice after billing, above estimate · Maersk 12,400.00 CZK · booked 14.11."],
      [true, "accrual", "2 estimates with no supplier invoice · since 02.11."],
      [false, "supplier_invoice", "1 supplier invoice to approve since 02.11."],
      [false, "supplier_invoice", "Supplier invoice refused"],
      [false, "cost_claim", "Cost claim open since 01.10. · 240.00 EUR"],
      [false, "not_recharged", "Detention bought, not sold on · 240.00 EUR"],
    ]);
    // No credit, no "not invoiced", no line not ticked, no other margin tag - and no work not yet invoiced.
    expect(a.tiles.signals).toMatchObject({ credit: 0, not_invoiced: 0, unticked: 0, margin: 1 });
    expect(a.tiles).toMatchObject({ notYetInvoiced: [], notYetInvoicedCzk: { amount: 0, label: "" }, notYetInvoicedJobs: 0 });
    // Its customer is asked of nobody, so it is not "not found" either.
    expect(a.notKnown).toEqual([]);
    // The people count what the rows show - but no work not yet invoiced of an invoiced job, and no active job.
    expect(a.people).toEqual([person("eva@firma.cz", { active: 0, jobsAtLoss: 1, estimatesOpen: 2, supplierInvoicesWaiting: 1, costClaimsOpen: 1 })]);
  });

  it("says nothing of a job that reads Invoiced and is in order: a thin margin on it is past acting on", () => {
    const [closed, quiet] = [job(), job()];
    const a = answer([closed, quiet], { invoicedIds: new Set([closed.id, quiet.id]), invoicing: facts(money(closed.id, LOSS), money(quiet.id, { totals: { profitCzk: 500, marginPct: 1 } })) });
    expect(a.urgent.rows.map((r) => [r.jobNumber, r.invoiced, r.tags.map((t) => t.text)])).toEqual([[closed.jobNumber, true, ["Loss −100 CZK"]]]);
    expect(a.attention.total).toBe(0);
  });

  it("applies the filters to the invoiced jobs too, and lists a person with only invoiced jobs after those with active ones", () => {
    const active = job({ personInCharge: "zoe@firma.cz" });
    const closedSea = job({ personInCharge: "eva@firma.cz" });
    const closedAir = job({ personInCharge: "eva@firma.cz", freightMode: "Air Freight" });
    const jobs = [active, closedSea, closedAir];
    const over = { invoicedIds: new Set([closedSea.id, closedAir.id]), invoicing: facts(money(active.id, { notYetInvoiced: [eur(10)] }), ...[closedSea, closedAir].map((j) => money(j.id, LOSS))) };
    expect(answer(jobs, over).urgent.rows.map((r) => r.jobNumber)).toEqual([closedSea.jobNumber, closedAir.jobNumber]);
    expect(answer(jobs, { ...over, mode: "air" }).urgent.rows.map((r) => r.jobNumber)).toEqual([closedAir.jobNumber]);
    expect(answer(jobs, { ...over, handledBy: "zoe@firma.cz" }).urgent.total).toBe(0);
    expect(answer(jobs, over).people).toEqual([person("zoe@firma.cz", { isUser: false, notYetInvoiced: [eur(10)] }), person("eva@firma.cz", { active: 0, jobsAtLoss: 2 })]);
  });

  it("applies the cockpit's filters: mode, Trade Direction, Handled By and nobody", () => {
    const sea = job({ status: "Billing [IMP]" });
    const air = job({ status: "Billing [EXP]", freightMode: "Air Freight", tradeDirection: "Export", personInCharge: "eva@firma.cz" });
    const road = job({ status: "Billing [DOM]", tradeDirection: "Domestic", department: "Road Department", freightMode: "", personInCharge: "" });
    const jobs = [sea, air, road];
    const over = { invoicing: facts(...jobs.map((j) => money(j.id, LOSS))) };
    const numbers = (a: ReturnType<typeof answer>) => a.urgent.rows.map((r) => r.jobNumber);
    expect(numbers(answer(jobs, over))).toEqual(jobs.map((j) => j.jobNumber));
    expect(numbers(answer(jobs, { ...over, mode: "air" }))).toEqual([air.jobNumber]);
    expect(numbers(answer(jobs, { ...over, mode: "road" }))).toEqual([road.jobNumber]);
    expect(numbers(answer(jobs, { ...over, direction: "import" }))).toEqual([sea.jobNumber]);
    expect(numbers(answer(jobs, { ...over, handledBy: " EVA@firma.cz " }))).toEqual([air.jobNumber]);
    expect(numbers(answer(jobs, { ...over, handledBy: "nobody" }))).toEqual([road.jobNumber]);
    // The tiles follow the Handled By filter; the people line does not - the filter is picked from it.
    const eva = answer(jobs, { ...over, handledBy: "eva@firma.cz" });
    expect(eva).toMatchObject({ handledBy: "eva@firma.cz", tiles: { signals: { margin: 1 } } });
    expect(eva.people.map((p) => [p.handledBy, p.isUser, p.active])).toEqual([
      ["eva@firma.cz", true, 1],
      ["jan@firma.cz", true, 1],
      // Nobody is no user.
      ["", false, 1],
    ]);
    // …but the mode and the direction narrow the people too.
    expect(answer(jobs, { ...over, mode: "air" }).people.map((p) => p.handledBy)).toEqual(["eva@firma.cz"]);
    // Without the users nobody can be said to be one.
    expect(answer(jobs, { ...over, userEmails: null }).people.map((p) => p.isUser)).toEqual([null, null, null]);
  });

  it("keeps with My reports only the jobs the caller's reports handle - and those of somebody who is no user", () => {
    const mine = job({ status: "Billing [IMP]", personInCharge: "jan@firma.cz" });
    const others = job({ status: "Billing [IMP]", personInCharge: "eva@firma.cz" });
    const gone = job({ status: "Billing [IMP]", personInCharge: "left@firma.cz" });
    const nobody = job({ status: "Billing [IMP]", personInCharge: "" });
    const jobs = [mine, others, gone, nobody];
    const a = answer(jobs, { invoicing: facts(...jobs.map((j) => money(j.id, LOSS))), reports: "mine", reportEmails: new Set(["jan@firma.cz"]) });
    expect(a.reports).toBe("mine");
    expect(a.urgent.rows.map((r) => r.jobNumber)).toEqual([mine.jobNumber, gone.jobNumber]);
    expect(a.people.map((p) => [p.handledBy, p.isUser])).toEqual([
      ["jan@firma.cz", true],
      ["left@firma.cz", false],
    ]);
    expect(moneyJobs(jobs, { mode: "all", direction: "all", reports: "mine", reportEmails: new Set(["jan@firma.cz"]), userEmails: new Set(["jan@firma.cz", "eva@firma.cz"]) }).map((j) => j.id)).toEqual([mine.id, gone.id]);
  });

  it("counts as a person's jobs at a loss every job of theirs whose profit is below zero, at any stage - what the cards say is what the table counts", () => {
    const working = job({ status: "Booked [IMP]" });
    const inBilling = job({ status: "Billing [IMP]" });
    const closed = job();
    const even = job({ status: "Billing [IMP]" });
    const unknown = job({ status: "Billing [IMP]" });
    const fine = job();
    const jobs = [working, inBilling, closed, even, unknown, fine];
    const a = answer(jobs, {
      invoicedIds: new Set([closed.id]),
      invoicing: facts(
        money(working.id, { totals: { profitCzk: -80_262, marginPct: -40 } }),
        money(inBilling.id, LOSS),
        money(closed.id, LOSS),
        // Nothing is no loss; a margin that is not known is none either.
        money(even.id, { totals: { profitCzk: 0, marginPct: 0 } }),
        money(unknown.id, { totals: { profitCzk: null, marginPct: null, ratesNote: "missing", missingCurrencies: ["USD"] } }),
        money(fine.id),
      ),
    });
    // The job still being worked on is on the ATTENTION card with its negative profit; the other two are URGENT losses.
    expect(a.attention.rows.find((r) => r.id === working.id)!.tags.map((t) => t.text)).toEqual(["Margin −40.0 % · profit −80,262 CZK"]);
    expect(a.urgent.rows.map((r) => r.id).sort()).toEqual([inBilling.id, closed.id].sort());
    expect(a.people).toEqual([person("jan@firma.cz", { active: 5, jobsAtLoss: 3 })]);
    // A job with a loss and no selling line carries no "profit" tag at all while it is worked on: it is counted all the same.
    const bare = job();
    const b = answer([bare], { invoicing: facts(money(bare.id, { sellingLines: 0, costLines: 2, totals: { profitCzk: -500, marginPct: null } })) });
    expect(b.attention.rows[0]!.tags.map((t) => t.text)).toEqual(["Costs and no selling line"]);
    expect(b.people[0]!.jobsAtLoss).toBe(1);
  });

  it("lists the people in the cockpit's order - the most jobs first, nobody after anyone as active, then by e-mail - with no ranking by what is worst", () => {
    const jobs = [
      job({ personInCharge: "" }),
      job({ personInCharge: "zoe@firma.cz" }),
      job({ personInCharge: "eva@firma.cz", status: "Billing [IMP]" }),
      job({ personInCharge: "jan@firma.cz" }),
      job({ personInCharge: "jan@firma.cz" }),
    ];
    const [, zoe, eva, jan1, jan2] = jobs;
    const a = answer(jobs, {
      invoicing: facts(
        money(jobs[0]!.id),
        money(zoe!.id, { estimatesOpen: { lines: 2, oldestSince: null, amounts: [] } }),
        // Eva's one job is the worst of all: she is still listed by her load, not first.
        money(eva!.id, { totals: { profitCzk: -90_000, marginPct: -50 }, supplierInvoices: { toApprove: 3 } }),
        money(jan1!.id, { notYetInvoiced: [eur(100), czk(50)], estimatesOpen: { lines: 1, oldestSince: null, amounts: [] }, supplierInvoices: { toApprove: 1 } }),
        money(jan2!.id, { notYetInvoiced: [eur(200)], estimatesOpen: { lines: 4, oldestSince: null, amounts: [] } }),
      ),
      claims: new Map([
        [jan1!.id, [{ createdAt: at("2026-11-10"), amount: 5, currency: "EUR" }]],
        [eva!.id, [{ createdAt: at("2026-11-10"), amount: 5, currency: "EUR" }, { createdAt: at("2026-11-11"), amount: null, currency: "" }]],
      ]),
    });
    expect(a.people).toEqual([
      person("jan@firma.cz", { active: 2, notYetInvoiced: [czk(50), eur(300)], estimatesOpen: 5, supplierInvoicesWaiting: 1, costClaimsOpen: 1 }),
      person("eva@firma.cz", { jobsAtLoss: 1, supplierInvoicesWaiting: 3, costClaimsOpen: 2 }),
      person("zoe@firma.cz", { isUser: false, estimatesOpen: 2 }),
      person("", { isUser: false }),
    ]);
  });

  it("gives no figure and no signal of Invoicing when Invoicing could not be read: null, never 0 - and names its families as not judged", () => {
    const j = job({ status: "Billing [IMP]", actualArrival: "2026-09-01" });
    const a = answer([j], {
      invoicing: null,
      notKnown: ["Invoicing: selling, costs and supplier invoices"],
      claims: new Map([[j.id, [{ createdAt: at("2026-10-01"), amount: 240, currency: "EUR" }]]]),
    });
    expect(a.tiles).toMatchObject({ notYetInvoiced: null, notYetInvoicedCzk: null, notYetInvoicedJobs: null, marginNotKnown: null });
    expect(a.tiles.signalsNotKnown).toEqual(["margin", "not_invoiced", "unticked", "cost_after_billing", "accrual", "supplier_invoice", "not_recharged"]);
    expect(a.people).toEqual([person("jan@firma.cz", { notYetInvoiced: null, jobsAtLoss: null, estimatesOpen: null, supplierInvoicesWaiting: null, costClaimsOpen: 1 })]);
    // What this database knows is still said.
    expect(a.attention.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Cost claim open since 01.10. · 240.00 EUR"]]);
    expect(a.notKnown).toEqual(["Invoicing: selling, costs and supplier invoices"]);
  });

  it("gives null - never 0 - for the figures of a family Invoicing could not read, names its kinds as not judged, and keeps the others", () => {
    const j = job({ status: "Billing [IMP]" });
    // The customer invoices: no work not yet invoiced, nothing known to have come after billing; the margin still is.
    const noInvoices = answer([j], { invoicing: facts(money(j.id, { ...LOSS, notYetInvoiced: null, untickedSelling: null, invoicesRead: false, estimatesOpen: { lines: 2, oldestSince: null, amounts: [] } })) });
    expect(noInvoices.tiles).toMatchObject({ notYetInvoiced: null, notYetInvoicedCzk: null, notYetInvoicedJobs: null, marginNotKnown: 0, signalsNotKnown: ["not_invoiced", "unticked", "cost_after_billing"] });
    expect(noInvoices.people).toEqual([person("jan@firma.cz", { notYetInvoiced: null, jobsAtLoss: 1, estimatesOpen: 2 })]);
    // The lines: nothing of the margins either.
    const noLines = answer([j], { invoicing: facts(money(j.id, { notYetInvoiced: null, untickedSelling: null, notRecharged: null, sellingLines: null, costLines: null, totals: { profitCzk: null, marginPct: null, estimateOfRealCzk: null, realOfEstimatedCzk: null } })) });
    expect(noLines.tiles).toMatchObject({ notYetInvoiced: null, notYetInvoicedJobs: null, marginNotKnown: null, signalsNotKnown: ["margin", "not_invoiced", "unticked", "not_recharged"] });
    expect(noLines.people[0]).toMatchObject({ notYetInvoiced: null, jobsAtLoss: null, estimatesOpen: 0 });
    // The supplier invoices and the estimates, each by itself.
    const noSuppliers = answer([j], { invoicing: facts(money(j.id, { supplierInvoices: null, estimatesOpen: null, notYetInvoiced: [eur(5)] })), statusChangedAt: new Map([[j.id, changed("2026-11-18", "Billing [IMP]", "09:00")]]) });
    expect(noSuppliers.tiles).toMatchObject({ notYetInvoiced: [eur(5)], notYetInvoicedJobs: 1, marginNotKnown: 0, signalsNotKnown: ["cost_after_billing", "accrual", "supplier_invoice"] });
    expect(noSuppliers.people).toEqual([person("jan@firma.cz", { notYetInvoiced: [eur(5)], estimatesOpen: null, supplierInvoicesWaiting: null })]);
  });

  it("names the cost claims and the credit as not judged when they could not be read, and gives null for the people's claims", () => {
    const a = answer([job()], { claims: null, notKnown: ["cost claims"] });
    expect(a.people[0]).toMatchObject({ costClaimsOpen: null, jobsAtLoss: 0 });
    expect(a.tiles.signals.cost_claim).toBe(0);
    expect(a.tiles.signalsNotKnown).toEqual(["cost_claim"]);
    expect(a.notKnown).toEqual(["cost claims"]);
    expect(answer([job()], { credit: null }).tiles.signalsNotKnown).toEqual(["credit"]);
    expect(answer([job()], { customerOf: null }).tiles.signalsNotKnown).toEqual(["credit"]);
    // A part of a family - since when a job is in Billing - is not the family: it is judged by the rest.
    expect(answer([job()], { statusChangedAt: null }).tiles.signalsNotKnown).toEqual([]);
  });

  it("names the jobs Invoicing did not answer, over the jobs asked about, and counts the others", () => {
    const [read, missing, otherMode] = [job(), job(), job({ freightMode: "Air Freight" })];
    const a = answer([read, missing, otherMode], { invoicing: facts(money(read.id, { notYetInvoiced: [eur(10)] })), mode: "sea" });
    expect(a.notKnown).toEqual([MONEY_GAPS.jobsNotRead(1)]);
    expect(a.notKnown).toEqual(["Invoicing: 1 job could not be read"]);
    expect(a.tiles).toMatchObject({ notYetInvoiced: [eur(10)], notYetInvoicedJobs: 1 });
  });

  it("names the customers that were not found and the limits that could not be compared, once each", () => {
    const [a1, a2, a3, a4] = [job(), job(), job(), job()];
    const a = answer([a1, a2, a3, a4], {
      customerOf: new Map<string, string | null>([
        [a1.id, "c-gone"],
        [a2.id, "c-eur"],
        [a3.id, "c-eur"],
        [a4.id, null],
      ]),
      credit: new Map([["c-eur", { creditLimit: 1000, currency: "CZK", unpaid: [eur(500)], overdueCount: 0 }]]),
      creditRates: null,
      notKnown: ["cost claims", "cost claims"],
    });
    expect(a.notKnown).toEqual(["cost claims", "customers' credit: 1 customer of these jobs not found", "customers' credit: the limit of 1 customer could not be compared (no ČNB rate today)"]);
    expect(a.tiles.signals.credit).toBe(0);
    // With the rate it is over: both of the customer's jobs say so.
    const rated = answer([a1, a2, a3, a4], { customerOf: new Map([[a2.id, "c-eur"], [a3.id, "c-eur"]]), credit: new Map([["c-eur", { creditLimit: 1000, currency: "CZK", unpaid: [eur(500)], overdueCount: 0 }]]), creditRates: { EUR: 25 } });
    expect(rated.notKnown).toEqual([]);
    expect(rated.tiles.signals.credit).toBe(2);
    expect(rated.attention.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Customer over limit"], ["Customer over limit"]]);
  });

  it("hands through capped and the holidays, and counts working days with the company's own days off", () => {
    const j = job({ status: "Billing [IMP]" });
    const over = { invoicing: facts(money(j.id, { notYetInvoiced: [eur(5)] })), statusChangedAt: new Map([[j.id, changed("2026-11-12", "Billing [IMP]", "10:00")]]) };
    expect(answer([j], over).attention.total).toBe(1);
    const off = answer([j], { ...over, holidays: ["2026-11-13", "2026-11-16"], capped: true, holidaysKnown: false });
    expect(off).toMatchObject({ capped: true, holidaysKnown: false, attention: { total: 0 } });
  });
});
