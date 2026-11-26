import { describe, expect, it } from "vitest";
// The server's own job totals (invoicing lib/jobCostTotals: the customer's Shipments tab, the Money tab): pure, so they
// run here beside the Costs tab's, and the two cannot drift apart unseen.
import { jobCostTotals } from "../../../../../../api/services/invoicing/lib/jobCostTotals";
import { computeCosts, qtyOrOne, realCounts, type BuyingRow, type SellingRow } from "./costsCalc";

const buy = (over: Partial<BuyingRow>): BuyingRow => ({
  id: "b1",
  category: "Ocean freight",
  description: "",
  vendor: "",
  supplierCustomerId: null,
  receivedAt: null,
  paidOn: "",
  paidBy: "",
  paidAt: null,
  supplierInvoiceId: null,
  estQty: "",
  estAmount: "",
  estCurrency: "CZK",
  realQty: "",
  realAmount: "",
  realCurrency: "CZK",
  invoiceNumber: "",
  received: false,
  ...over,
});

const sell = (over: Partial<SellingRow>): SellingRow => ({
  id: "s1",
  category: "Ocean freight",
  description: "",
  customer: "",
  qty: "",
  amount: "",
  currency: "CZK",
  invoice: true,
  sourceBuyId: null,
  ...over,
});

const rates = { CZK: 1, EUR: 25, USD: 22 };

describe("computeCosts", () => {
  it("converts each row by its own currency (no single ROE for all rows)", () => {
    // the council's example: 1000 EUR + 5000 CZK billed in CZK = 30 000, not 150 000
    const t = computeCosts(
      [],
      [sell({ id: "a", amount: "1000", currency: "EUR" }), sell({ id: "b", amount: "5000", currency: "CZK" })],
      "CZK",
      rates,
    );
    expect(t.sellTotal).toBe(30000);
    expect(t.sellTotalCZK).toBe(30000);
  });

  it("converts into a foreign billing currency through CZK", () => {
    const t = computeCosts([], [sell({ amount: "5000", currency: "CZK" })], "EUR", rates);
    expect(t.sellTotal).toBe(200);
    expect(t.sellCZK).toBe(5000);
  });

  it("reads Czech decimal commas and quantities", () => {
    const t = computeCosts([], [sell({ amount: "1 250,50", qty: "2" })], "CZK", rates);
    expect(t.sellTotal).toBe(2501);
  });

  it("uses Real cost when filled, Est. otherwise, and computes profit", () => {
    const t = computeCosts(
      [
        buy({ id: "x", estAmount: "100", estCurrency: "EUR", realAmount: "110", realCurrency: "EUR" }),
        buy({ id: "y", estAmount: "1000" }),
      ],
      [sell({ amount: "200", currency: "EUR" })],
      "CZK",
      rates,
    );
    expect(t.buyTotal).toBe(110 * 25 + 1000);
    expect(t.sellTotal).toBe(5000);
    expect(t.profitCZK).toBe(5000 - 3750);
    expect(t.rxeTotal).toBe(250);
  });

  it("leaves rows not ticked for invoicing out of revenue", () => {
    const t = computeCosts(
      [],
      [sell({ id: "a", amount: "100" }), sell({ id: "b", amount: "40", invoice: false })],
      "CZK",
      rates,
    );
    expect(t.sellTotal).toBe(100);
    expect(t.sellNotInvoicedTotal).toBe(40);
    expect(t.sellNotInvoicedCount).toBe(1);
  });

  it("adds up the rows as they are shown, rounded to cents (User Council O19)", () => {
    // Three CZK lines billed in EUR at 24.335: each row shows its EUR figure rounded to cents,
    // and the total is their sum, not the sum of the unrounded conversions.
    const r = { CZK: 1, EUR: 24.335 };
    const t = computeCosts(
      [],
      [
        sell({ id: "a", amount: "38739.86" }),
        sell({ id: "b", amount: "7543.85" }),
        sell({ id: "c", amount: "31882.01" }),
      ],
      "EUR",
      r,
    );
    const rows = ["a", "b", "c"].map((id) => t.sellRowTotals[id]!);
    rows.forEach((v) => expect(Math.round(v * 100) / 100).toBe(v));
    expect(t.sellTotal).toBe(Math.round(rows.reduce((s, v) => s + v, 0) * 100) / 100);
  });

  it("gives the Report bar and the CZK line under Total selling one figure", () => {
    const r = { CZK: 1, EUR: 24.335 };
    const t = computeCosts(
      [buy({ estAmount: "1000.01", estCurrency: "EUR" })],
      [sell({ id: "a", amount: "1591.94", currency: "EUR" }), sell({ id: "b", amount: "1310.13", currency: "EUR" })],
      "EUR",
      r,
    );
    expect(t.sellTotal).toBe(2902.07);
    expect(t.sellTotalCZK).toBe(t.sellCZK);
    expect(t.sellCZK).toBe(Math.round(2902.07 * 24.335 * 100) / 100);
    expect(t.profitCZK).toBe(Math.round((t.sellCZK - t.buyCZK) * 100) / 100);
  });

  it("never converts a currency without a rate at 1 - it reports it instead", () => {
    const t = computeCosts([], [sell({ id: "a", amount: "100", currency: "GBP" }), sell({ id: "b", amount: "50" })], "CZK", rates);
    expect(t.sellTotal).toBe(50);
    expect(t.sellRowTotals.a).toBeNull();
    expect(t.missingCurrencies).toEqual(["GBP"]);
    expect(t.unconvertibleRowCount).toBe(1);
  });
});

describe("the CZK figures, as the server's job profit has them (mock council S7-1)", () => {
  const r = { CZK: 1, EUR: 25.3, USD: 22.1 };

  it("keeps a 1,000 CZK cost at 1,000.00 on a EUR-billed job, though its row reads 39.53 EUR", () => {
    const t = computeCosts([buy({ category: "thc", realAmount: "1000", realCurrency: "CZK" })], [], "EUR", r);
    expect(t.buyRowTotals.b1).toBe(39.53);
    expect(t.buyCZK).toBe(1000);
    // A job sold at what it cost shows no profit at all, not -0.11 or +0.11.
    const even = computeCosts(
      [buy({ realAmount: "1000", realCurrency: "CZK" })],
      [sell({ amount: "1000", currency: "CZK" })],
      "EUR",
      r,
    );
    expect(even.profitCZK).toBe(0);
  });

  it("adds each row's own CZK value and rounds the sum to haléř, as jobCostTotals does", () => {
    const buying = [
      buy({ id: "a", realAmount: "1000", realCurrency: "CZK" }),
      buy({ id: "b", estAmount: "123.45", estCurrency: "USD" }),
      buy({ id: "c", realAmount: "77.77", realQty: "3", realCurrency: "EUR", estAmount: "1", estCurrency: "EUR" }),
    ];
    const selling = [sell({ id: "x", amount: "2000.01", currency: "EUR" }), sell({ id: "y", amount: "999", currency: "CZK", invoice: false })];
    const t = computeCosts(buying, selling, "EUR", r);
    const cost = 1000 + 123.45 * 22.1 + 77.77 * 3 * 25.3;
    const revenue = 2000.01 * 25.3;
    expect(t.buyCZK).toBe(Math.round(cost * 100) / 100);
    expect(t.sellCZK).toBe(Math.round(revenue * 100) / 100);
    expect(t.sellTotalCZK).toBe(t.sellCZK);
    expect(t.profitCZK).toBe(Math.round((revenue - cost) * 100) / 100);
  });
});

describe("a quantity of 0 (Council Review 7, K19)", () => {
  it("is 0, as on invoices, in the job's cost totals and in a sailing's Earnings; only a blank quantity is 1", () => {
    expect(qtyOrOne("")).toBe(1);
    expect(qtyOrOne("  ")).toBe(1);
    expect(qtyOrOne(null)).toBe(1);
    expect(qtyOrOne(undefined)).toBe(1);
    expect(qtyOrOne("0")).toBe(0);
    expect(qtyOrOne("0,00")).toBe(0);
    expect(qtyOrOne(0)).toBe(0);
    expect(qtyOrOne("2,5")).toBe(2.5);
  });

  it("adds nothing to the selling total, where it used to add one unit", () => {
    const t = computeCosts([], [sell({ id: "a", qty: "0", amount: "500" }), sell({ id: "b", qty: "", amount: "300" }), sell({ id: "c", qty: "2", amount: "100" })], "CZK", rates);
    expect(t.sellTotal).toBe(500);
    expect(t.sellRowTotals).toMatchObject({ a: 0, b: 300, c: 200 });
  });

  // A real cost at quantity 0 is a real cost of 0: its amount is filled in, so the estimate no longer counts (it used to).
  it("adds nothing to the buying total: an estimate with quantity 0, and a real cost with quantity 0 over its estimate", () => {
    const none = computeCosts([buy({ id: "a", estQty: "0", estAmount: "400" })], [], "CZK", rates);
    expect(none.buyTotal).toBe(0);
    const real = computeCosts([buy({ id: "a", estQty: "1", estAmount: "400", realQty: "0", realAmount: "999" })], [], "CZK", rates);
    expect(real.buyTotal).toBe(0);
    expect(real.buyCZK).toBe(0);
  });
});

describe("a real cost counts once its amount is filled in, even when it comes to 0", () => {
  it("is filled in by its amount alone: a blank amount is none, whatever its quantity", () => {
    expect(realCounts(buy({ realAmount: "0" }))).toBe(true);
    expect(realCounts(buy({ realAmount: "0,00" }))).toBe(true);
    expect(realCounts(buy({ realAmount: "" }))).toBe(false);
    expect(realCounts(buy({ realAmount: "  " }))).toBe(false);
    expect(realCounts(buy({ realAmount: "", realQty: "2" }))).toBe(false);
  });

  it("counts a real amount of 0 typed over an estimate as 0, not the estimate", () => {
    const t = computeCosts([buy({ id: "a", estAmount: "400", realAmount: "0" })], [sell({ amount: "1000" })], "CZK", rates);
    expect(t.buyRowTotals.a).toBe(0);
    expect([t.buyTotal, t.buyCZK, t.profitCZK]).toEqual([0, 0, 1000]);
    // The Real column has its total, 0.00, where it showed none.
    expect([t.hasReal, t.realStrictTotal, t.estTotal]).toEqual([true, 0, 400]);
  });

  it("counts a real quantity of 0 typed over an estimate as 0, not the estimate", () => {
    const t = computeCosts([buy({ id: "a", estAmount: "16", estCurrency: "EUR", realAmount: "20", realQty: "0", realCurrency: "EUR" })], [], "CZK", rates);
    expect([t.buyRowTotals.a, t.buyTotal, t.buyCZK]).toEqual([0, 0, 0]);
  });

  it("sets it against the estimate: below it, and in Real − Estimated", () => {
    const t = computeCosts(
      [buy({ id: "a", estAmount: "400", realAmount: "0" }), buy({ id: "b", estAmount: "100", realAmount: "30", realQty: "0" })],
      [],
      "CZK",
      rates,
    );
    expect([t.buyRowUnder.a, t.buyRowOver.a, t.buyRowUnder.b]).toEqual([true, false, true]);
    expect(t.hasRxe).toBe(true);
    expect(t.rxeTotal).toBe(-500);
    expect(t.rxeRows.map((x) => [x.id, x.delta, x.pct])).toEqual([["a", -400, -100], ["b", -100, -100]]);
  });

  it("needs no rate for a 0: the row stays in the totals and no currency is missing", () => {
    // The real currency has no rate, but a real cost of 0 needs none - nor does the blank estimate in it.
    const t = computeCosts(
      [
        buy({ id: "a", estAmount: "400", realAmount: "0", realCurrency: "JPY" }),
        buy({ id: "b", estAmount: "100", realAmount: "250", realQty: "0", realCurrency: "JPY" }),
        buy({ id: "c", estCurrency: "JPY", realAmount: "0", realCurrency: "JPY" }),
      ],
      [],
      "CZK",
      rates,
    );
    expect(t.buyRowTotals).toEqual({ a: 0, b: 0, c: 0 });
    expect([t.missingCurrencies, t.unconvertibleRowCount, t.buyTotal]).toEqual([[], 0, 0]);
  });

  it("leaves the estimate counting while the real amount is blank, and the Real total empty", () => {
    const t = computeCosts([buy({ id: "a", estAmount: "400", realQty: "1" })], [], "CZK", rates);
    expect([t.buyTotal, t.hasReal, t.hasRxe]).toEqual([400, false, false]);
  });
});

describe("an estimate is there to compare with once it is filled in, even as 0 - as the real cost", () => {
  it("sets a real cost against an estimate typed as 0, not against a blank one", () => {
    const t = computeCosts(
      [buy({ id: "a", estAmount: "0", realAmount: "300" }), buy({ id: "b", estAmount: "", realAmount: "300" }), buy({ id: "c", estAmount: "50", estQty: "0", realAmount: "20" })],
      [],
      "CZK",
      rates,
    );
    expect([t.buyRowOver.a, t.buyRowOver.b, t.buyRowOver.c]).toEqual([true, false, true]);
    expect(t.rxeRows.map((x) => [x.id, x.delta, x.pct])).toEqual([["a", 300, 0], ["c", 20, 0]]);
    expect(t.rxeTotal).toBe(320);
  });
});

describe("a row counting its real cost whose estimate has no rate", () => {
  it("stays in the totals at its real cost; only its estimate is left out, of the Est. total and of Real − Estimated", () => {
    const t = computeCosts(
      [buy({ id: "a", estAmount: "10", estCurrency: "JPY", realAmount: "200" }), buy({ id: "b", estAmount: "100" })],
      [sell({ amount: "500" })],
      "CZK",
      rates,
    );
    expect(t.buyRowTotals).toEqual({ a: 200, b: 100 });
    expect([t.buyTotal, t.buyCZK, t.profitCZK, t.realStrictTotal, t.estTotal]).toEqual([300, 300, 200, 200, 100]);
    expect([t.missingCurrencies, t.unconvertibleRowCount]).toEqual([[], 0]);
    expect([t.estimateMissingCurrencies, t.estimateLeftOutCount]).toEqual([["JPY"], 1]);
    expect([t.buyRowOver.a, t.buyRowUnder.a, t.hasRxe]).toEqual([false, false, false]);
  });

  it("is still left out when the side it counts has no rate: its estimate, until a real cost is filled in", () => {
    const t = computeCosts([buy({ id: "a", estAmount: "10", estCurrency: "JPY", realQty: "1" })], [], "CZK", rates);
    expect([t.buyRowTotals.a, t.unconvertibleRowCount, t.missingCurrencies, t.estimateLeftOutCount]).toEqual([null, 1, ["JPY"], 0]);
  });
});

describe("the Costs tab and the server's job totals (lib/jobCostTotals)", () => {
  it("give one cost for the same rows: a real cost counts once its amount is filled in, even at 0, and needs only its own rate", () => {
    const r = { CZK: 1, EUR: 25.3, USD: 22.1 };
    const buying = [
      buy({ id: "a", estAmount: "500", realAmount: "0" }), // a real amount of 0: 0
      buy({ id: "b", estAmount: "300", estCurrency: "EUR", realAmount: "280", realQty: "0", realCurrency: "EUR" }), // a real quantity of 0: 0
      buy({ id: "c", estAmount: "40", realAmount: "0", realCurrency: "JPY" }), // a 0 needs no rate
      buy({ id: "d", estAmount: "50", estQty: "2", estCurrency: "EUR", realQty: "2" }), // no real amount: the estimate, 2 × 50 EUR
      buy({ id: "e", estAmount: "100", estCurrency: "USD", realAmount: "120.5", realCurrency: "USD" }), // the real cost
      buy({ id: "f", estAmount: "1000", estQty: "0" }), // an estimate at quantity 0: 0
      buy({ id: "g" }), // nothing typed
      buy({ id: "h", estAmount: "10", estCurrency: "JPY", realAmount: "200" }), // the real cost; its estimate has no rate
    ];
    const web = computeCosts(buying, [], "EUR", r);
    const blankIsNull = (v: string) => (v.trim() === "" ? null : v);
    const server = jobCostTotals(
      buying.map((b) => ({
        estQty: blankIsNull(b.estQty), estAmount: blankIsNull(b.estAmount), estCurrency: b.estCurrency,
        realQty: blankIsNull(b.realQty), realAmount: blankIsNull(b.realAmount), realCurrency: b.realCurrency,
      })),
      [],
      "EUR",
      r,
      "CZK",
    );
    const cost = Math.round((2 * 50 * 25.3 + 120.5 * 22.1 + 200) * 100) / 100;
    expect(web.buyCZK).toBe(cost);
    expect(server.costCzk).toBe(cost);
    expect([web.missingCurrencies, web.unconvertibleRowCount, server.missingCurrencies]).toEqual([[], 0, []]);
    // Only the estimate beside a real cost is left out on the tab, and said to be.
    expect([web.estimateMissingCurrencies, web.estimateLeftOutCount]).toEqual([["JPY"], 1]);
  });
});
