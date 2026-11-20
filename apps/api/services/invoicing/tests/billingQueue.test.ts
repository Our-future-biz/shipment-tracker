import { describe, expect, it } from "vitest";
import { buildBillingQueue, countCreditsOwed, countInvoicedLines, countNotTicked, type QueueOpenInvoice, type QueueSellingRow } from "../lib/billingQueue";

const rates = { CZK: 1, EUR: 25, USD: 22 };
const row = (id: string, shipmentId: string, amount: string, currency = "CZK", qty: string | null = "1.00"): QueueSellingRow => ({
  id, shipmentId, amount, currency, qty,
});
const inv = (shipmentId: string, number: string, gross: string, ids: string[], currency = "CZK"): QueueOpenInvoice => ({
  shipmentId, number, gross, currency, sourceSellingCostIds: ids,
});

const run = (rows: QueueSellingRow[], openInvoices: QueueOpenInvoice[], billing: Record<string, string> = {}) =>
  buildBillingQueue({ rows, openInvoices, billingCurrencies: new Map(Object.entries(billing)), rates, roePct: 100 });

describe("buildBillingQueue", () => {
  it("estimates foreign-currency rows with the ROE %, as the invoice will", () => {
    const [e] = buildBillingQueue({
      rows: [row("a", "s1", "1000.00", "EUR"), row("b", "s1", "5000.00")],
      openInvoices: [],
      billingCurrencies: new Map([["s1", "CZK"]]),
      rates,
      roePct: 102,
    });
    expect(e!.amountToBill).toBe(25500 + 5000);
  });

  it("lists a shipment with ticked rows and no invoice as to bill, in its billing currency", () => {
    const [e] = run([row("a", "s1", "1000.00", "EUR"), row("b", "s1", "5000.00")], [], { s1: "CZK" });
    expect(e).toMatchObject({ shipmentId: "s1", status: "to_bill", amountToBill: 30000, rowsToBill: 2, billingCurrency: "CZK", invoiceNumbers: [] });
  });

  it("converts into a foreign billing currency", () => {
    const [e] = run([row("a", "s1", "5000.00")], [], { s1: "EUR" });
    expect(e).toMatchObject({ amountToBill: 200, billingCurrency: "EUR" });
  });

  it("is invoiced when every ticked row is on an open invoice", () => {
    const [e] = run([row("a", "s1", "1000.00")], [inv("s1", "INV2026CZ00000001-001", "1000.00", ["a"])]);
    expect(e).toMatchObject({ status: "invoiced", amountToBill: 0, rowsToBill: 0, invoiceNumbers: ["INV2026CZ00000001-001"], invoiced: [{ currency: "CZK", gross: 1000 }] });
  });

  it("is partly invoiced when rows were added after the invoice", () => {
    const [e] = run([row("a", "s1", "1000.00"), row("b", "s1", "250.50")], [inv("s1", "INV2026CZ00000001-001", "1000.00", ["a"])]);
    expect(e).toMatchObject({ status: "partly_invoiced", amountToBill: 250.5, rowsToBill: 1 });
  });

  it("puts rows of a credited invoice back to bill (credited invoices are not passed as open)", () => {
    const [e] = run([row("a", "s1", "1000.00")], []);
    expect(e).toMatchObject({ status: "to_bill", amountToBill: 1000 });
  });

  it("leaves out shipments with nothing ticked and nothing invoiced, and zero rows", () => {
    expect(run([row("a", "s1", "0.00"), row("b", "s1", "", "CZK")], [])).toEqual([]);
  });

  it("multiplies by quantity and reports currencies without a rate", () => {
    const [e] = run([row("a", "s1", "100.00", "CZK", "3.00"), row("b", "s1", "10.00", "GBP")], []);
    expect(e).toMatchObject({ amountToBill: 300, rowsToBill: 2, missingCurrencies: ["GBP"] });
  });
});

describe("buildBillingQueue quantities", () => {
  it("counts a blank quantity as 1 and leaves a row with quantity 0 out", () => {
    const [e] = run([row("a", "s1", "100", "CZK", null), row("b", "s1", "100", "CZK", "0")], []);
    expect(e).toMatchObject({ amountToBill: 100, rowsToBill: 1 });
  });
});

describe("countInvoicedLines", () => {
  const row = (id: string, shipmentId: string, amount: string | null = "100.00") => ({ id, shipmentId, qty: "1.00", amount });

  it("counts a job's lines with a value and those on an open invoice", () => {
    const counts = countInvoicedLines(
      [row("a", "s1"), row("b", "s1"), row("c", "s1"), row("zero", "s1", "0.00"), row("d", "s2")],
      [{ sourceSellingCostIds: ["a", "c", null] }],
    );
    expect(counts.get("s1")).toEqual({ invoiced: 2, total: 3 });
    expect(counts.get("s2")).toEqual({ invoiced: 0, total: 1 });
  });

  it("leaves a line below nothing on no invoice out: a credit owed, not a charge to bill (Y1 / P1)", () => {
    const counts = countInvoicedLines(
      [row("a", "s1", "1000.00"), row("diff", "s1", "-50.00"), row("disc", "s2", "-20.00"), row("b", "s2")],
      [{ sourceSellingCostIds: ["a", "b", "disc"] }],
    );
    // The open −50 does not keep the job from reading Invoiced.
    expect(counts.get("s1")).toEqual({ invoiced: 1, total: 1 });
    // On an invoice (a discount billed with the rest, or settled by a partial credit note) it counts as invoiced.
    expect(counts.get("s2")).toEqual({ invoiced: 2, total: 2 });
  });

  it("leaves out the row a partial credit note put on the job: 5 charges, 4 invoiced read 4/5, not 5/6 (B19)", () => {
    const charges = ["a", "b", "c", "d", "e"].map((id) => row(id, "s1"));
    const credit = { ...row("cn-row", "s1", "-100.00"), sourceCreditNoteId: "cn1" };
    const counts = countInvoicedLines([...charges, credit], [{ sourceSellingCostIds: ["a", "b", "c", "d"] }, { sourceSellingCostIds: ["cn-row"] }]);
    expect(counts.get("s1")).toEqual({ invoiced: 4, total: 5 });
  });

  it("has no entry for a job without lines", () => {
    expect(countInvoicedLines([], []).get("s1")).toBeUndefined();
  });
});

describe("countCreditsOwed (M3)", () => {
  const row = (id: string, shipmentId: string, amount: string | null, qty: string | null = "1.00") => ({ id, shipmentId, qty, amount });

  it("counts a job's lines below nothing on no open invoice, only when the job has one", () => {
    const owed = countCreditsOwed(
      [
        row("a", "s1", "1000.00"),
        row("diff", "s1", "-50.00"),
        // settled by a partial credit note: its line is on it
        row("settled", "s1", "-20.00"),
        // a discount of a job not invoiced yet: billed with the rest, owed to nobody
        row("disc", "s2", "-30.00"),
        row("blank", "s3", "-10.00", null),
        row("zero", "s3", "-10.00", "0"),
      ],
      [
        { shipmentId: "s1", sourceSellingCostIds: ["a", "settled"] },
        { shipmentId: "s3", sourceSellingCostIds: [] },
      ],
    );
    expect([...owed]).toEqual([["s1", 1], ["s3", 1]]);
  });
});

// Mock council S5-3: a charge not ticked for Invoice kept the job in To bill with 0 to bill and no word why.
describe("countNotTicked (S5-3)", () => {
  const row = (id: string, shipmentId: string, amount: string | null, invoice: boolean, over: Record<string, unknown> = {}) => ({ id, shipmentId, qty: "1.00", amount, invoice, ...over });

  it("counts a job's charges on no open invoice that are not ticked for Invoice", () => {
    const counts = countNotTicked(
      [
        row("ticked", "s1", "1000.00", true),
        row("late", "s1", "150.00", false),
        // on an open invoice already: billed
        row("billed", "s1", "90.00", false),
        // below nothing, nothing, or a credit note's own row: no charge
        row("credit", "s1", "-20.00", false),
        row("blank", "s2", null, false),
        row("cn", "s2", "40.00", false, { sourceCreditNoteId: "cn1" }),
      ],
      [{ sourceSellingCostIds: ["billed"] }],
    );
    expect([...counts]).toEqual([["s1", 1]]);
  });
});
