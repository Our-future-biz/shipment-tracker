import { describe, expect, it } from "vitest";
import { CHARGE_CODES } from "../../../lib/chargeCodes";
import {
  RECHARGED_CHARGE_CODES,
  estimatesOpenOf,
  moneyTotals,
  notRechargedOf,
  operationsMoneyJobs,
  supplierInvoicesOf,
  type MoneyBuyRow,
  type MoneySellRow,
  type MoneySupplierInvoice,
  type OperationsMoneyFacts,
} from "../lib/operationsMoney";

// The money facts of a job for Shipments → Managers' Money tab (Council Outlay 11, step 4): every rule of the
// pure assembly. Amounts are per currency, never added across; a part not read is null or empty, never 0.

const JOB = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const OTHER = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const RATES = { EUR: 25, USD: 20 };
const TODAY = "2026-11-18";

let seq = 0;
const sell = (over: Partial<MoneySellRow> = {}): MoneySellRow => ({
  id: `s${++seq}`, shipmentId: JOB, category: "ocean_freight", qty: null, amount: null, currency: "CZK", invoice: true, sourceBuyId: null, ...over,
});
const buy = (over: Partial<MoneyBuyRow> = {}): MoneyBuyRow => ({
  id: `b${++seq}`, shipmentId: JOB, category: "ocean_freight", estQty: null, estAmount: null, estCurrency: "CZK", realQty: null, realAmount: null, realCurrency: "CZK",
  supplierInvoiceId: null, createdAt: new Date("2026-10-14T09:00:00Z"), ...over,
});
const supplierInvoice = (over: Partial<MoneySupplierInvoice> = {}): MoneySupplierInvoice => ({
  id: `h${++seq}`, supplierCustomerId: null, haulierId: null, vendor: "MSC", invoiceNumber: "FV-1", numberKey: "FV-1", kind: "invoice", dueDate: null,
  receivedAt: new Date("2026-11-10T09:00:00Z"), createdAt: new Date("2026-11-10T09:00:00Z"), status: "booked", decidedAt: null, paidOn: null, refusedLines: [], ...over,
});
const facts = (over: Partial<OperationsMoneyFacts> = {}): OperationsMoneyFacts => ({
  shipmentIds: [JOB],
  today: TODAY,
  lines: { selling: [], buying: [], billingCurrency: new Map() },
  invoices: { open: [], billedOn: new Map() },
  supplierInvoices: { invoices: [], lines: [], claims: [], suppliers: new Map() },
  estimates: [],
  rates: new Map([[JOB, RATES]]),
  noRates: new Map(),
  ...over,
});
const only = (f: OperationsMoneyFacts) => operationsMoneyJobs(f)[0]!;

describe("work not yet invoiced", () => {
  it("is every valued selling line not on an open invoice, ticked or not, each currency on its own", () => {
    const billed = sell({ amount: "100", currency: "EUR" });
    const job = only(
      facts({
        lines: {
          selling: [billed, sell({ amount: "50", qty: "2", currency: "EUR" }), sell({ amount: "300", currency: "USD", invoice: false }), sell({ amount: "1000" }), sell({ amount: null })],
          buying: [],
          billingCurrency: new Map(),
        },
        invoices: { open: [{ shipmentId: JOB, sourceSellingCostIds: [billed.id, null] }], billedOn: new Map([[JOB, "2026-11-05"]]) },
      }),
    );
    // 2 × 50 EUR, 300 USD (not ticked: still work not invoiced) and 1000 CZK - three amounts, no one total.
    expect(job.notYetInvoiced).toEqual([{ currency: "CZK", amount: 1000 }, { currency: "USD", amount: 300 }, { currency: "EUR", amount: 100 }]);
    expect(job.untickedSelling).toEqual([{ currency: "USD", amount: 300 }]);
    expect(job.sellingLines).toBe(4);
    expect(job.invoicedOn).toBe("2026-11-05");
  });

  it("counts a line again once its invoice is credited or cancelled: only an open invoice bills it", () => {
    const row = sell({ amount: "100", currency: "EUR" });
    const lines = { selling: [row], buying: [], billingCurrency: new Map<string, string>() };
    // The repository hands over open invoices only (issued, not credited, not cancelled): a credited one is not among them.
    const credited = only(facts({ lines, invoices: { open: [], billedOn: new Map() } }));
    expect(credited.notYetInvoiced).toEqual([{ currency: "EUR", amount: 100 }]);
    expect(credited.invoicedOn).toBeNull();
    const open = only(facts({ lines, invoices: { open: [{ shipmentId: JOB, sourceSellingCostIds: [row.id] }], billedOn: new Map([[JOB, "2026-11-05"]]) } }));
    expect(open.notYetInvoiced).toEqual([]);
  });

  it("takes a job's lines against its own invoices only", () => {
    const mine = sell({ amount: "100" });
    const theirs = sell({ shipmentId: OTHER, amount: "70" });
    const jobs = operationsMoneyJobs(
      facts({
        shipmentIds: [JOB, OTHER],
        lines: { selling: [mine, theirs], buying: [], billingCurrency: new Map() },
        invoices: { open: [{ shipmentId: OTHER, sourceSellingCostIds: [theirs.id] }], billedOn: new Map([[OTHER, "2026-11-01"]]) },
      }),
    );
    expect(jobs.map((j) => [j.shipmentId, j.notYetInvoiced, j.invoicedOn])).toEqual([
      [JOB, [{ currency: "CZK", amount: 100 }], null],
      [OTHER, [], "2026-11-01"],
    ]);
  });

  it("on a job with an open invoice, a line below nothing on no invoice is a credit owed, not work to bill (Y1 / P1)", () => {
    const billed = sell({ amount: "1000", currency: "EUR" });
    const priceDown = sell({ amount: "-50", qty: "1.00", currency: "EUR" });
    const late = sell({ amount: "200", currency: "EUR" });
    const invoices = { open: [{ shipmentId: JOB, sourceSellingCostIds: [billed.id] }], billedOn: new Map([[JOB, "2026-11-05"]]) };
    const job = only(facts({ lines: { selling: [billed, priceDown, late], buying: [], billingCurrency: new Map() }, invoices }));
    expect(job.notYetInvoiced).toEqual([{ currency: "EUR", amount: 200 }]);
    expect(job.creditOwed).toEqual([{ currency: "EUR", amount: 50 }]);
    // Settled by a partial credit note (its line bills the difference line): nothing owed any more.
    const settled = only(facts({ lines: { selling: [billed, priceDown], buying: [], billingCurrency: new Map() }, invoices: { ...invoices, open: [{ shipmentId: JOB, sourceSellingCostIds: [billed.id, priceDown.id] }] } }));
    expect(settled.creditOwed).toEqual([]);
    // A job never invoiced: a discount goes on its invoice with the rest, as before.
    const fresh = only(facts({ lines: { selling: [sell({ amount: "1000" }), sell({ amount: "-100" })], buying: [], billingCurrency: new Map() } }));
    expect(fresh.notYetInvoiced).toEqual([{ currency: "CZK", amount: 900 }]);
    expect(fresh.creditOwed).toEqual([]);
  });

  it("says since when the charges added after invoicing wait, when every line still to bill came after the first invoice (P16)", () => {
    const billed = sell({ amount: "1000", createdAt: new Date("2026-10-30T09:00:00Z") });
    const invoices = { open: [{ shipmentId: JOB, sourceSellingCostIds: [billed.id] }], billedOn: new Map([[JOB, "2026-11-05"]]) };
    const lines = (selling: MoneySellRow[]) => ({ selling: [billed, ...selling], buying: [], billingCurrency: new Map<string, string>() });
    const late = [sell({ amount: "300", createdAt: new Date("2026-11-12T09:00:00Z") }), sell({ amount: "100", createdAt: new Date("2026-11-10T09:00:00Z") })];
    expect(only(facts({ lines: lines(late), invoices })).lateChargeSince).toBe("2026-11-10");
    // A line left off the invoice since before it: nothing late about it - the tax date counts.
    const leftOff = sell({ amount: "100", createdAt: new Date("2026-11-01T09:00:00Z") });
    expect(only(facts({ lines: lines([...late, leftOff]), invoices })).lateChargeSince).toBeNull();
    // Nothing to bill, or never invoiced: none.
    expect(only(facts({ lines: lines([]), invoices })).lateChargeSince).toBeNull();
    expect(only(facts({ lines: lines(late), invoices: { open: [], billedOn: new Map() } })).lateChargeSince).toBeNull();
  });

  it("leaves an unticked line that is on an open invoice out of the unticked ones", () => {
    const row = sell({ amount: "100", invoice: false });
    const job = only(facts({ lines: { selling: [row], buying: [], billingCurrency: new Map() }, invoices: { open: [{ shipmentId: JOB, sourceSellingCostIds: [row.id] }], billedOn: new Map() } }));
    expect(job.untickedSelling).toEqual([]);
  });
});

describe("Costs Breakdown's totals", () => {
  it("are in CZK at the job's own rates: ticked selling, the estimate, the real cost so far, and profit on real-else-estimate", () => {
    const t = moneyTotals(
      [
        buy({ estAmount: "100", estCurrency: "EUR", realAmount: "120", realCurrency: "EUR" }), // real wins: 3000
        buy({ estAmount: "1000", estQty: "2" }), // no real yet: its estimate 2000 counts as cost
      ],
      [sell({ amount: "300", currency: "EUR" }), sell({ amount: "999", invoice: false })],
      "EUR",
      RATES,
    );
    expect(t).toEqual({
      sellingCzk: 7500, estimateCzk: 4500, realCzk: 3000, estimateOfRealCzk: 2500, realOfEstimatedCzk: 3000, costCzk: 5000, profitCzk: 2500, marginPct: 33.33,
      missingCurrencies: [], ratesNote: "",
    });
  });

  it("compare real cost with estimate like for like: over only the lines that have both", () => {
    const t = moneyTotals(
      [
        buy({ estAmount: "100", estCurrency: "EUR", realAmount: "110", realQty: "2", realCurrency: "USD" }), // 2500 estimated, 4400 real: in two currencies, both through CZK
        buy({ estAmount: "1000", realAmount: "900" }), // under its estimate
        buy({ realAmount: "5000" }), // a real cost nobody estimated: no overrun of an estimate
        buy({ estAmount: "700" }), // an estimate with no real cost yet
        buy({ estAmount: "0", realAmount: "300" }), // an estimate of 0 is no estimate
      ],
      [],
      "CZK",
      RATES,
    );
    expect(t).toMatchObject({ estimateCzk: 4200, realCzk: 10600, estimateOfRealCzk: 3500, realOfEstimatedCzk: 5300 });
    // No line with both: nothing to compare, and that is known.
    expect(moneyTotals([buy({ realAmount: "5000" }), buy({ estAmount: "700" })], [], "CZK", RATES)).toMatchObject({ estimateOfRealCzk: 0, realOfEstimatedCzk: 0 });
  });

  it("can't compare real cost with estimate when one of the lines with both has a currency with no rate - the two go together", () => {
    const rows = [buy({ estAmount: "100", estCurrency: "EUR", realAmount: "9000", realCurrency: "JPY" }), buy({ estAmount: "1000", realAmount: "900" })];
    expect(moneyTotals(rows, [], "CZK", RATES)).toMatchObject({ estimateCzk: 3500, estimateOfRealCzk: null, realOfEstimatedCzk: null, missingCurrencies: ["JPY"], ratesNote: "missing" });
    // A currency with no rate on a line that has not both does not stand in the way.
    const t = moneyTotals([buy({ estAmount: "10", estCurrency: "JPY" }), buy({ estAmount: "1000", realAmount: "900" })], [], "CZK", RATES);
    expect(t).toMatchObject({ estimateOfRealCzk: 1000, realOfEstimatedCzk: 900, missingCurrencies: ["JPY"] });
  });

  it("are not known when a rate is missing - the currency is named, nothing is taken at 1", () => {
    const t = moneyTotals([buy({ estAmount: "10", estCurrency: "JPY" })], [sell({ amount: "5", currency: "EUR" })], "CZK", RATES);
    expect(t).toEqual({
      sellingCzk: null, estimateCzk: null, realCzk: 0, estimateOfRealCzk: 0, realOfEstimatedCzk: 0, costCzk: null, profitCzk: null, marginPct: null,
      missingCurrencies: ["JPY"], ratesNote: "missing",
    });
  });

  it("say why a currency has no rate: ČNB has none, the job's rates are not fixed, or they could not be read - and nothing when none is missing", () => {
    const lines = { selling: [sell({ amount: "100", currency: "EUR" })], buying: [buy({ estAmount: "50" })], billingCurrency: new Map<string, string>() };
    const note = (over: Partial<OperationsMoneyFacts>) => only(facts({ lines, ...over })).totals;
    // The job's rates are known and hold the currency: nothing is missing.
    expect(note({})).toMatchObject({ profitCzk: 2450, missingCurrencies: [], ratesNote: "" });
    // Known, without that currency: ČNB publishes none.
    expect(note({ rates: new Map([[JOB, { USD: 20 }]]) })).toMatchObject({ profitCzk: null, missingCurrencies: ["EUR"], ratesNote: "missing" });
    // Not fixed yet, and the job's dates were not handed in.
    expect(note({ rates: new Map(), noRates: new Map([[JOB, "not_fixed"]]) })).toMatchObject({ profitCzk: null, missingCurrencies: ["EUR"], ratesNote: "not_fixed" });
    // fx could not value the job - or did not answer at all.
    expect(note({ rates: new Map(), noRates: new Map([[JOB, "unreadable"]]) })).toMatchObject({ missingCurrencies: ["EUR"], ratesNote: "unreadable" });
    expect(note({ rates: new Map(), noRates: new Map() })).toMatchObject({ missingCurrencies: ["EUR"], ratesNote: "unreadable" });
    // A job all in CZK needs no rate: whatever is said of its rates, nothing is missing.
    const czk = { selling: [sell({ amount: "100" })], buying: [], billingCurrency: new Map<string, string>() };
    expect(only(facts({ lines: czk, rates: new Map(), noRates: new Map([[JOB, "not_fixed"]]) })).totals).toMatchObject({ profitCzk: 100, missingCurrencies: [], ratesNote: "" });
  });

  it("say so when the job's rates are of an older fixing - its date's not imported - and are worked out all the same (m20)", () => {
    const lines = { selling: [sell({ amount: "100", currency: "EUR" })], buying: [buy({ estAmount: "50" })], billingCurrency: new Map<string, string>() };
    const stale = only(facts({ lines, rates: new Map([[JOB, { EUR: 25 }]]), staleRates: new Set([JOB]) }));
    expect(stale.totals).toMatchObject({ sellingCzk: 2500, profitCzk: 2450, ratesStale: true });
    expect(only(facts({ lines, rates: new Map([[JOB, { EUR: 25 }]]) })).totals.ratesStale).toBe(false);
    // A job with no rates at all has nothing stale to say.
    expect(only(facts({ lines, rates: new Map(), staleRates: new Set([JOB]) })).totals.ratesStale).toBe(false);
  });

  it("are not known for a job with no rates at all unless everything is in CZK", () => {
    const foreign = only(facts({ lines: { selling: [sell({ amount: "100", currency: "EUR" })], buying: [buy({ estAmount: "50" })], billingCurrency: new Map() }, rates: new Map() }));
    expect(foreign.totals).toMatchObject({ sellingCzk: null, profitCzk: null, marginPct: null, missingCurrencies: ["EUR"], ratesNote: "unreadable" });
    const czk = only(facts({ lines: { selling: [sell({ amount: "100" })], buying: [buy({ estAmount: "60" })], billingCurrency: new Map() }, rates: new Map() }));
    expect(czk.totals).toEqual({
      sellingCzk: 100, estimateCzk: 60, realCzk: 0, estimateOfRealCzk: 0, realOfEstimatedCzk: 0, costCzk: 60, profitCzk: 40, marginPct: 40, missingCurrencies: [], ratesNote: "", ratesStale: false,
    });
  });

  it("need the rate of the billing currency too, as Costs Breakdown does", () => {
    const job = only(facts({ lines: { selling: [sell({ amount: "100" })], buying: [], billingCurrency: new Map([[JOB, "GBP"]]) } }));
    expect(job.totals).toMatchObject({ profitCzk: null, missingCurrencies: ["GBP"] });
  });

  it("have no margin when nothing is sold, and a negative one at a loss", () => {
    expect(moneyTotals([buy({ realAmount: "500" })], [], "CZK", RATES)).toMatchObject({ sellingCzk: 0, costCzk: 500, profitCzk: -500, marginPct: null });
    expect(moneyTotals([buy({ realAmount: "1500" })], [sell({ amount: "1000" })], "CZK", RATES)).toMatchObject({ profitCzk: -500, marginPct: -50 });
  });

  it("name a currency only an estimate is in, and still total what does not need it", () => {
    // The real cost is in CZK, its estimate was in JPY: profit counts the real cost, the estimate column is not known.
    const t = moneyTotals([buy({ estAmount: "10", estCurrency: "JPY", realAmount: "200" })], [sell({ amount: "300" })], "CZK", RATES);
    expect(t).toEqual({
      sellingCzk: 300, estimateCzk: null, realCzk: 200, estimateOfRealCzk: null, realOfEstimatedCzk: null, costCzk: 200, profitCzk: 100, marginPct: 33.33,
      missingCurrencies: ["JPY"], ratesNote: "missing",
    });
  });

  it("count the lines with a value", () => {
    const job = only(facts({ lines: { selling: [sell({ amount: "100" }), sell()], buying: [buy({ estAmount: "5" }), buy({ realAmount: "7" }), buy()], billingCurrency: new Map() } }));
    expect([job.sellingLines, job.costLines]).toEqual([1, 2]);
  });
});

describe("delay charges not sold on", () => {
  it("names only codes of the catalogue", () => {
    const known = new Set(CHARGE_CODES.map((c) => c.code));
    expect(RECHARGED_CHARGE_CODES.filter((code) => !known.has(code))).toEqual([]);
    expect(RECHARGED_CHARGE_CODES).toEqual(expect.arrayContaining(["container_demurrage", "container_detention", "truck_waiting", "container_storage", "waiting_time"]));
  });

  it("lists a bought demurrage, detention, storage or waiting line with no selling line of its code, per code and currency", () => {
    const out = notRechargedOf(
      [
        buy({ category: "container_detention", realAmount: "120", realQty: "2", realCurrency: "EUR" }),
        buy({ category: "container_detention", estAmount: "40", estCurrency: "USD" }), // an estimate counts until the real cost is in
        buy({ category: "Container demurrage (DEM)", realAmount: "500" }), // an older row holding the label
        buy({ category: "ocean_freight", realAmount: "9000" }), // no delay charge
        buy({ category: "waiting_time" }), // no value
      ],
      [sell({ category: "ocean_freight", amount: "9500" })],
    );
    expect(out).toEqual([
      { code: "container_demurrage", label: "Container demurrage (DEM)", currency: "CZK", amount: 500 },
      { code: "container_detention", label: "Container detention (DET)", currency: "EUR", amount: 240 },
      { code: "container_detention", label: "Container detention (DET)", currency: "USD", amount: 40 },
    ]);
  });

  it("takes a valued selling line of the same code, or one copied from the buy line, as sold on", () => {
    const storage = buy({ category: "container_storage", realAmount: "300" });
    const waiting = buy({ category: "truck_waiting", realAmount: "80", realCurrency: "EUR" });
    const demurrage = buy({ category: "container_demurrage", realAmount: "700" });
    const out = notRechargedOf(
      [storage, waiting, demurrage],
      [
        sell({ category: "container_storage", amount: "350", invoice: false }), // sold on, ticked or not (not ticked is its own signal)
        sell({ category: "other", amount: "90", currency: "EUR", sourceBuyId: waiting.id }), // copied from the waiting line under another code
        sell({ category: "container_demurrage", amount: null }), // an empty line sells nothing on
      ],
    );
    expect(out).toEqual([{ code: "container_demurrage", label: "Container demurrage (DEM)", currency: "CZK", amount: 700 }]);
  });

  it("takes a selling line of the older code of the same charge as sold on, and the other way round - two newer codes stay two charges", () => {
    const notSold = (buyCategory: string, sellCategory: string) =>
      notRechargedOf([buy({ category: buyCategory, realAmount: "500" })], [sell({ category: sellCategory, amount: "600" })]).map((line) => line.code);
    // A container's demurrage sold on as the older "Demurrage" line, by its code or by its label - and an older buy line sold on under the newer code.
    expect(notSold("container_demurrage", "Demurrage")).toEqual([]);
    expect(notSold("container_demurrage", "demurrage")).toEqual([]);
    expect(notSold("demurrage", "container_demurrage")).toEqual([]);
    // Every mode's storage was the older "Storage"; rail's one charge is both storage and demurrage.
    expect(notSold("cfs_storage", "Storage")).toEqual([]);
    expect(notSold("storage", "air_storage")).toEqual([]);
    expect(notSold("rail_storage", "Demurrage")).toEqual([]);
    expect(notSold("demurrage", "rail_storage")).toEqual([]);
    // Not the same charge: bonded storage sold on says nothing of the container's storage, nor detention of demurrage.
    expect(notSold("container_storage", "bonded_storage")).toEqual(["container_storage"]);
    expect(notSold("container_demurrage", "container_detention")).toEqual(["container_demurrage"]);
    expect(notSold("container_demurrage", "Storage")).toEqual(["container_demurrage"]);
  });
});

describe("supplier invoices of a job", () => {
  const SUPPLIER = "3f2b8c1a-0d4e-4c55-9a7b-1e2d3c4b5a69";
  const none = new Map<string, string[]>();

  it("counts those to approve with the day the oldest was booked, the refused and the approved overdue", () => {
    const later = supplierInvoice({ status: "booked", receivedAt: new Date("2026-11-12T09:00:00Z") });
    const older = supplierInvoice({ status: "booked", receivedAt: null, createdAt: new Date("2026-11-03T23:30:00Z") }); // booked 4 Nov in Prague
    const out = supplierInvoicesOf(
      [
        later,
        older,
        supplierInvoice({ status: "refused", decidedAt: new Date("2026-11-11T23:30:00Z") }), // refused on 12 Nov in Prague
        supplierInvoice({ status: "approved", dueDate: "2026-11-10" }), // overdue
        supplierInvoice({ status: "approved", dueDate: "2026-11-18" }), // due today: not overdue
        supplierInvoice({ status: "approved", dueDate: "2026-11-01", paidOn: "2026-11-02" }), // paid
        supplierInvoice({ status: "approved", dueDate: "2026-11-01", kind: "credit_note" }), // a credit note is never due
      ],
      [],
      none,
      [],
      new Map(),
      null,
      TODAY,
    );
    expect(out).toEqual({ toApprove: 2, waitingIds: [later.id, older.id], refused: 1, lastRefusedOn: "2026-11-12", refusedOn: ["2026-11-12"], claimed: 0, approvedOverdue: 1, oldestWaitingSince: "2026-11-04", afterBilling: [] });
  });

  it("hands over the day each invoice was refused, oldest first, so a reader counts those of its own window (m21)", () => {
    const days = (...invoices: MoneySupplierInvoice[]) => supplierInvoicesOf(invoices, [], none, [], new Map(), null, TODAY).refusedOn;
    expect(
      days(
        supplierInvoice({ status: "refused", decidedAt: new Date("2026-11-14T10:00:00Z") }),
        supplierInvoice({ status: "refused", decidedAt: new Date("2026-09-03T10:00:00Z") }),
        supplierInvoice({ status: "refused", decidedAt: null }), // no moment stored: in no list
        supplierInvoice({ status: "approved", decidedAt: new Date("2026-11-17T10:00:00Z") }), // an approval is no refusal
      ),
    ).toEqual(["2026-09-03", "2026-11-14"]);
    expect(days()).toEqual([]);
  });

  it("says the day of the newest refusal - none when no invoice is refused, or the refusal has no moment stored", () => {
    const refusedOn = (...invoices: MoneySupplierInvoice[]) => supplierInvoicesOf(invoices, [], none, [], new Map(), null, TODAY).lastRefusedOn;
    expect(
      refusedOn(
        supplierInvoice({ status: "refused", decidedAt: new Date("2026-11-03T10:00:00Z") }),
        supplierInvoice({ status: "refused", decidedAt: new Date("2026-11-14T10:00:00Z") }),
        supplierInvoice({ status: "refused", decidedAt: new Date("2026-10-20T10:00:00Z") }),
        supplierInvoice({ status: "approved", decidedAt: new Date("2026-11-17T10:00:00Z") }), // an approval is no refusal
      ),
    ).toBe("2026-11-14");
    expect(refusedOn(supplierInvoice({ status: "approved", decidedAt: new Date("2026-11-17T10:00:00Z") }), supplierInvoice())).toBeNull();
    expect(refusedOn(supplierInvoice({ status: "refused", decidedAt: null }))).toBeNull();
  });

  it("takes the due day from the supplier's payment days when the invoice has none, and says not known when those were not read", () => {
    const h = supplierInvoice({ status: "approved", supplierCustomerId: SUPPLIER, receivedAt: new Date("2026-10-20T09:00:00Z") });
    const withTerms = (days: number) => supplierInvoicesOf([h], [], none, [], new Map([[SUPPLIER, { companyName: "MSC Czech", paymentDays: days }]]), null, TODAY);
    expect(withTerms(14).approvedOverdue).toBe(1); // due 3 Nov
    expect(withTerms(60).approvedOverdue).toBe(0);
    expect(supplierInvoicesOf([h], [], none, [], null, null, TODAY).approvedOverdue).toBeNull();
    // An invoice with a due day of its own does not hang on the terms: it is counted all the same…
    const ownDay = (dueDate: string) => supplierInvoice({ status: "approved", supplierCustomerId: SUPPLIER, dueDate });
    expect(supplierInvoicesOf([ownDay("2026-11-01")], [], none, [], null, null, TODAY).approvedOverdue).toBe(1);
    // …also beside one that does hang on them: at least the one is overdue.
    expect(supplierInvoicesOf([h, ownDay("2026-11-01"), ownDay("2026-11-10")], [], none, [], null, null, TODAY).approvedOverdue).toBe(2);
    // None overdue by its own day, and one hanging on the terms: not known - not 0.
    expect(supplierInvoicesOf([h, ownDay("2026-11-30")], [], none, [], null, null, TODAY).approvedOverdue).toBeNull();
    // Every one judged by its own day: 0 is known.
    expect(supplierInvoicesOf([ownDay("2026-11-30")], [], none, [], null, null, TODAY).approvedOverdue).toBe(0);
    // Not linked to a supplier: no terms to read, its due day is not known (as Accounts Payable shows it) - not overdue.
    expect(supplierInvoicesOf([{ ...h, supplierCustomerId: null }], [], none, [], null, null, TODAY).approvedOverdue).toBe(0);
  });

  it("counts an invoice an open cost claim holds: tied to it, or naming its number on a job it has a line on", () => {
    const tied = supplierInvoice({ numberKey: "A1" });
    const byNumber = supplierInvoice({ numberKey: "B2" });
    const settled = supplierInvoice({ numberKey: "C3" });
    const claim = (over: Record<string, unknown>) => ({ id: `c${++seq}`, shipmentId: JOB, supplierInvoiceId: null, invoiceNumber: "", status: "open", ...over });
    const claims = [claim({ supplierInvoiceId: tied.id }), claim({ invoiceNumber: "b 2" }), claim({ supplierInvoiceId: settled.id, status: "accepted" })];
    const jobsOf = new Map([[byNumber.id, [JOB]]]);
    expect(supplierInvoicesOf([tied, byNumber, settled], [], jobsOf, claims, new Map(), null, TODAY).claimed).toBe(2);
    expect(supplierInvoicesOf([tied, byNumber, settled], [], jobsOf, null, new Map(), null, TODAY).claimed).toBeNull();
  });

  it("lists an invoice booked after the day the job was invoiced - not on the day itself - with what it bills on the job and whether it is above its estimate", () => {
    const late = supplierInvoice({ invoiceNumber: "LATE-1", supplierCustomerId: SUPPLIER, vendor: "msc", receivedAt: new Date("2026-11-10T09:00:00Z") });
    const sameDay = supplierInvoice({ invoiceNumber: "SAME-2", receivedAt: new Date("2026-11-05T15:00:00Z") });
    const early = supplierInvoice({ invoiceNumber: "EARLY-3", receivedAt: new Date("2026-11-04T09:00:00Z") });
    const refused = supplierInvoice({ invoiceNumber: "REF-4", status: "refused", receivedAt: new Date("2026-11-12T09:00:00Z") });
    const paid = supplierInvoice({ invoiceNumber: "PAID-5", status: "approved", paidOn: "2026-11-15", receivedAt: new Date("2026-11-11T09:00:00Z") });
    const lines = [
      buy({ supplierInvoiceId: late.id, estAmount: "100", estCurrency: "EUR", realAmount: "130", realCurrency: "EUR" }), // above its estimate
      buy({ supplierInvoiceId: late.id, realAmount: "20", realQty: "2", realCurrency: "EUR" }),
      buy({ supplierInvoiceId: late.id, realAmount: "500" }), // a second currency: its own entry, never added
      buy({ supplierInvoiceId: sameDay.id, estAmount: "900", realAmount: "900" }), // as estimated
      buy({ supplierInvoiceId: early.id, estAmount: "10", realAmount: "99" }),
      buy({ supplierInvoiceId: paid.id, estAmount: "10", realAmount: "99" }), // came after billing too, but it is paid: history
    ];
    const out = supplierInvoicesOf([late, sameDay, early, refused, paid], lines, none, [], new Map([[SUPPLIER, { companyName: "MSC Czech", paymentDays: 30 }]]), "2026-11-05", TODAY);
    expect(out.afterBilling).toEqual([
      { id: late.id, number: "LATE-1", supplier: "MSC Czech", bookedOn: "2026-11-10", currency: "CZK", amount: 500, aboveEstimate: true },
      { id: late.id, number: "LATE-1", supplier: "MSC Czech", bookedOn: "2026-11-10", currency: "EUR", amount: 170, aboveEstimate: true },
    ]);
    // Booked on the day of the customer invoice (5 Nov) is not after billing; the day after is.
    const dayAfter = supplierInvoicesOf([sameDay], lines, none, [], new Map(), "2026-11-04", TODAY);
    expect(dayAfter.afterBilling).toEqual([{ id: sameDay.id, number: "SAME-2", supplier: "MSC", bookedOn: "2026-11-05", currency: "CZK", amount: 900, aboveEstimate: false }]);
  });

  it("does not call a line above its estimate across currencies, or with no estimate", () => {
    const h = supplierInvoice({});
    const after = (line: Partial<MoneyBuyRow>) => supplierInvoicesOf([h], [buy({ supplierInvoiceId: h.id, ...line })], none, [], new Map(), "2026-11-01", TODAY).afterBilling[0]!.aboveEstimate;
    expect(after({ estAmount: "100", estCurrency: "EUR", realAmount: "3000", realCurrency: "CZK" })).toBe(false);
    expect(after({ realAmount: "3000" })).toBe(false);
    expect(after({ estAmount: "100", realAmount: "100.01" })).toBe(true);
    expect(after({ estAmount: "100", realAmount: "100" })).toBe(false);
  });

  it("says the day an invoice with no Received stamp was booked by when its record was made", () => {
    const h = supplierInvoice({ receivedAt: null, createdAt: new Date("2026-11-08T23:30:00Z") }); // 9 Nov in Prague
    const out = supplierInvoicesOf([h], [buy({ supplierInvoiceId: h.id, realAmount: "10" })], none, [], new Map(), "2026-11-08", TODAY);
    expect(out.afterBilling).toEqual([{ id: h.id, number: "FV-1", supplier: "MSC", bookedOn: "2026-11-09", currency: "CZK", amount: 10, aboveEstimate: false }]);
  });

  it("says nothing came after billing for a job not invoiced, or when the invoices were not read", () => {
    const h = supplierInvoice({});
    const lines = [buy({ supplierInvoiceId: h.id, realAmount: "10" })];
    expect(supplierInvoicesOf([h], lines, none, [], new Map(), null, TODAY).afterBilling).toEqual([]);
    expect(supplierInvoicesOf([h], lines, none, [], new Map(), undefined, TODAY).afterBilling).toEqual([]);
  });

  it("puts each invoice on the jobs it has a live line on, and a refused one on the jobs its lines were taken off", () => {
    const shared = supplierInvoice({ invoiceNumber: "SHARED" });
    const refused = supplierInvoice({ invoiceNumber: "REF", status: "refused", refusedLines: [{ table: "invoice_cost", ownerId: OTHER }, { table: "master_job_cost", ownerId: JOB }] });
    const jobs = operationsMoneyJobs(
      facts({
        shipmentIds: [JOB, OTHER],
        invoices: { open: [], billedOn: new Map([[OTHER, "2026-11-01"]]) },
        supplierInvoices: {
          invoices: [shared, refused],
          lines: [
            buy({ supplierInvoiceId: shared.id, realAmount: "100", realCurrency: "EUR" }),
            buy({ supplierInvoiceId: shared.id, realAmount: "40", realCurrency: "EUR" }),
            buy({ shipmentId: OTHER, supplierInvoiceId: shared.id, estAmount: "50", estCurrency: "EUR", realAmount: "60", realCurrency: "EUR" }),
          ],
          claims: [],
          suppliers: new Map(),
        },
      }),
    );
    expect(jobs[0]!.supplierInvoices).toMatchObject({ toApprove: 1, refused: 0, afterBilling: [] });
    // The other job was invoiced on 1 Nov: its share of the invoice (60 EUR, above its estimate) came after - not the 140 EUR of the first job.
    expect(jobs[1]!.supplierInvoices).toMatchObject({
      toApprove: 1,
      refused: 1,
      afterBilling: [{ id: shared.id, number: "SHARED", supplier: "MSC", bookedOn: "2026-11-10", currency: "EUR", amount: 60, aboveEstimate: true }],
    });
  });

  it("names the invoices each job waits on by their ids: one invoice with lines on three jobs is the same id on each", () => {
    const THIRD = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c03";
    const carrier = supplierInvoice({ invoiceNumber: "CARRIER-1" });
    const own = supplierInvoice({ invoiceNumber: "OWN-2" });
    const jobs = operationsMoneyJobs(
      facts({
        shipmentIds: [JOB, OTHER, THIRD],
        supplierInvoices: {
          invoices: [carrier, own],
          lines: [
            buy({ supplierInvoiceId: carrier.id, realAmount: "100" }),
            buy({ shipmentId: OTHER, supplierInvoiceId: carrier.id, realAmount: "200" }),
            buy({ shipmentId: THIRD, supplierInvoiceId: carrier.id, realAmount: "300" }),
            buy({ shipmentId: THIRD, supplierInvoiceId: carrier.id, realAmount: "50" }),
            buy({ shipmentId: THIRD, supplierInvoiceId: own.id, realAmount: "10" }),
          ],
          claims: [],
          suppliers: new Map(),
        },
      }),
    );
    // Each job counts it as one to approve, so a count over the three must go by the ids: one invoice, not three.
    expect(jobs.map((j) => [j.supplierInvoices!.toApprove, j.supplierInvoices!.waitingIds])).toEqual([
      [1, [carrier.id]],
      [1, [carrier.id]],
      [2, [carrier.id, own.id]],
    ]);
    expect(new Set(jobs.flatMap((j) => j.supplierInvoices!.waitingIds)).size).toBe(2);
  });
});

describe("estimates with no supplier invoice", () => {
  it("are counted with the day the oldest was entered and their amounts per currency", () => {
    const out = estimatesOpenOf([
      buy({ estAmount: "100", estQty: "3", estCurrency: "EUR", createdAt: new Date("2026-10-20T09:00:00Z") }),
      buy({ estAmount: "50", estCurrency: "EUR", createdAt: new Date("2026-10-13T22:30:00Z") }), // 14 Oct in Prague
      buy({ estAmount: "2000", createdAt: new Date("2026-11-01T09:00:00Z") }),
    ]);
    expect(out).toEqual({ lines: 3, oldestSince: "2026-10-14", amounts: [{ currency: "CZK", amount: 2000 }, { currency: "EUR", amount: 350 }] });
    expect(estimatesOpenOf([])).toEqual({ lines: 0, oldestSince: null, amounts: [] });
  });

  it("are each job's own", () => {
    const jobs = operationsMoneyJobs(facts({ shipmentIds: [JOB, OTHER], estimates: [buy({ estAmount: "10" }), buy({ shipmentId: OTHER, estAmount: "20" }), buy({ shipmentId: OTHER, estAmount: "5", estCurrency: "EUR" })] }));
    expect(jobs.map((j) => j.estimatesOpen!.lines)).toEqual([1, 2]);
    expect(jobs[1]!.estimatesOpen!.amounts).toEqual([{ currency: "CZK", amount: 20 }, { currency: "EUR", amount: 5 }]);
  });
});

describe("a part that could not be read", () => {
  const row = sell({ amount: "100" });
  const read = facts({
    lines: { selling: [row], buying: [buy({ category: "container_detention", realAmount: "40" })], billingCurrency: new Map() },
    invoices: { open: [], billedOn: new Map([[JOB, "2026-11-05"]]) },
  });

  it("answers a job with no rows at all with zeros that are known", () => {
    expect(only(facts())).toEqual({
      shipmentId: JOB,
      notYetInvoiced: [],
      untickedSelling: [],
      creditOwed: [],
      lateChargeSince: null,
      sellingLines: 0,
      costLines: 0,
      totals: { sellingCzk: 0, estimateCzk: 0, realCzk: 0, estimateOfRealCzk: 0, realOfEstimatedCzk: 0, costCzk: 0, profitCzk: 0, marginPct: null, missingCurrencies: [], ratesNote: "", ratesStale: false },
      invoicedOn: null,
      notRecharged: [],
      supplierInvoices: { toApprove: 0, waitingIds: [], refused: 0, lastRefusedOn: null, refusedOn: [], claimed: 0, approvedOverdue: 0, oldestWaitingSince: null, afterBilling: [] },
      estimatesOpen: { lines: 0, oldestSince: null, amounts: [] },
    });
  });

  it("gives no count, no totals and no list without the lines", () => {
    const job = only({ ...read, lines: null });
    expect(job).toMatchObject({ notYetInvoiced: [], untickedSelling: [], sellingLines: null, costLines: null, notRecharged: [], invoicedOn: "2026-11-05" });
    // Not for a rate: no currency is named, and the note is empty.
    expect(job.totals).toEqual({
      sellingCzk: null, estimateCzk: null, realCzk: null, estimateOfRealCzk: null, realOfEstimatedCzk: null, costCzk: null, profitCzk: null, marginPct: null,
      missingCurrencies: [], ratesNote: "",
    });
  });

  it("gives no work not yet invoiced and no invoice day without the customer invoices - the totals still stand", () => {
    const job = only({ ...read, invoices: null });
    expect(job).toMatchObject({ notYetInvoiced: [], untickedSelling: [], invoicedOn: null, sellingLines: 1 });
    expect(job.totals.profitCzk).toBe(60);
    expect(job.notRecharged).toHaveLength(1);
  });

  it("gives null for the supplier invoices and for the estimates, each on its own", () => {
    expect(only({ ...read, supplierInvoices: null })).toMatchObject({ supplierInvoices: null, estimatesOpen: { lines: 0 } });
    expect(only({ ...read, estimates: null })).toMatchObject({ estimatesOpen: null, supplierInvoices: { toApprove: 0 } });
  });
});
