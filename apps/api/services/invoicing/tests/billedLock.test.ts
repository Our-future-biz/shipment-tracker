import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const countOpenInvoices = vi.hoisted(() => vi.fn());
vi.mock("../repositories/invoice.repository", () => ({ invoiceRepository: { countOpenInvoices } }));

import { BILLED, BILLED_NUMBER_FIRST, BILLED_REAL_COST_IN, assertNotBilled, billedBuyingProblem, billedRefusesOutright, leavesBuyingCostAlone } from "../lib/billedLock";

beforeEach(() => countOpenInvoices.mockReset());

describe("a billed shipment's costs", () => {
  it("are refused a change while an invoice is open", async () => {
    countOpenInvoices.mockResolvedValue(1);
    await expect(assertNotBilled("s", "c")).rejects.toThrow(/billed.*Credit the invoice/);
  });

  it("change freely with no invoice, or once every invoice is credited", async () => {
    countOpenInvoices.mockResolvedValue(0);
    await expect(assertNotBilled("s", "c")).resolves.toBeUndefined();
  });
});

describe("what still goes on a billed shipment", () => {
  it("on a buying row: its place, and that its invoice was received or paid", () => {
    expect(leavesBuyingCostAlone({ sortOrder: 2 })).toBe(true);
    expect(leavesBuyingCostAlone({ paidOn: "2026-11-09" })).toBe(true);
    expect(leavesBuyingCostAlone({ received: true })).toBe(true);
    expect(leavesBuyingCostAlone({ paidOn: undefined, sortOrder: 1 })).toBe(true);
  });

  it("on a buying row: the supplier it is linked to, so a late supplier invoice counts in what is owed", () => {
    expect(leavesBuyingCostAlone({ supplierCustomerId: "s1" })).toBe(true);
    expect(leavesBuyingCostAlone({ haulierId: "" })).toBe(true);
    // The typed vendor is the row's text: it stays.
    expect(leavesBuyingCostAlone({ vendor: "Maersk", supplierCustomerId: "s1" })).toBe(false);
  });

  it("not the money, the estimate or the words of a buying row", () => {
    expect(leavesBuyingCostAlone({ realAmount: "10" })).toBe(false);
    expect(leavesBuyingCostAlone({ estAmount: "10" })).toBe(false);
    expect(leavesBuyingCostAlone({ estCurrency: "EUR", sortOrder: 1 })).toBe(false);
    expect(leavesBuyingCostAlone({ invoiceNumber: "F1", realAmount: "10" })).toBe(false);
  });

  it("the number of the supplier's invoice that came after the billing (Accounts Payable D6)", () => {
    expect(leavesBuyingCostAlone({ invoiceNumber: "F1", paidOn: "" })).toBe(true);
    expect(leavesBuyingCostAlone({ invoiceNumber: "F1", received: true })).toBe(true);
  });
});

describe("a late supplier invoice typed by hand on a billed shipment (User Council Q1)", () => {
  it("takes its real cost with the number, sent with it or already on the line", () => {
    expect(billedBuyingProblem({ invoiceNumber: "F1", realAmount: "1450", realCurrency: "USD" }, { invoiceNumber: "" })).toBeNull();
    expect(billedBuyingProblem({ realAmount: "1450" }, { invoiceNumber: "TESTUC-AP-001" })).toBeNull();
    expect(billedBuyingProblem({ realCurrency: "USD" }, { invoiceNumber: "F1" })).toBeNull();
    expect(billedBuyingProblem({ realQty: "2" }, { invoiceNumber: "F1" })).toBeNull();
    expect(billedBuyingProblem({ realAmount: "1450", received: true, sortOrder: 1 }, { invoiceNumber: "F1" })).toBeNull();
  });

  it("only while the line has no real amount: one already on it stays as billed", () => {
    expect(billedBuyingProblem({ realAmount: "500" }, { invoiceNumber: "X", realAmount: "1000.00" })).toBe(BILLED_REAL_COST_IN);
    expect(billedBuyingProblem({ realQty: "2" }, { invoiceNumber: "X", realAmount: "1000.00" })).toBe(BILLED_REAL_COST_IN);
    expect(billedBuyingProblem({ realCurrency: "EUR" }, { invoiceNumber: "X", realAmount: "0.00" })).toBe(BILLED_REAL_COST_IN);
    expect(billedBuyingProblem({ realAmount: "" }, { invoiceNumber: "X", realAmount: "1000.00" })).toBe(BILLED_REAL_COST_IN);
    expect(billedBuyingProblem({ realAmount: "1000.00" }, { invoiceNumber: "", realAmount: "1000.00" })).toBe(BILLED_REAL_COST_IN);
    expect(billedBuyingProblem({ realAmount: "500" }, { invoiceNumber: "X", realAmount: null })).toBeNull();
    // Its number still changes: it leaves the cost alone.
    expect(billedBuyingProblem({ invoiceNumber: "Y" }, { invoiceNumber: "X", realAmount: "1000.00" })).toBeNull();
  });

  it("asks for the number first on a line that has none", () => {
    expect(billedBuyingProblem({ realAmount: "1450" }, { invoiceNumber: "" })).toBe(BILLED_NUMBER_FIRST);
    expect(billedBuyingProblem({ realAmount: "1450" }, { invoiceNumber: "   " })).toBe(BILLED_NUMBER_FIRST);
    expect(billedBuyingProblem({ realAmount: "1450" }, null)).toBe(BILLED_NUMBER_FIRST);
    // The number cleared with it: no number, no real cost.
    expect(billedBuyingProblem({ invoiceNumber: "", realAmount: "1450" }, { invoiceNumber: "F1" })).toBe(BILLED_NUMBER_FIRST);
  });

  it("keeps the estimate, the words and the vendor as billed, with a number or not", () => {
    expect(billedBuyingProblem({ estAmount: "10" }, { invoiceNumber: "F1" })).toBe(BILLED);
    expect(billedBuyingProblem({ realAmount: "10", estAmount: "10" }, { invoiceNumber: "F1" })).toBe(BILLED);
    expect(billedBuyingProblem({ realAmount: "10", description: "x" }, { invoiceNumber: "F1" })).toBe(BILLED);
    expect(billedBuyingProblem({ realAmount: "10", vendor: "Maersk" }, { invoiceNumber: "F1" })).toBe(BILLED);
    expect(billedBuyingProblem({ category: "customs", invoiceNumber: "F1" }, null)).toBe(BILLED);
    expect(billedRefusesOutright({ estCurrency: "EUR" })).toBe(true);
    expect(billedRefusesOutright({ realAmount: "10" })).toBe(false);
  });

  it("lets through what leaves the cost alone, as before", () => {
    expect(billedBuyingProblem({ invoiceNumber: "F1", received: true }, null)).toBeNull();
    expect(billedBuyingProblem({ paidOn: "2026-11-09" }, { invoiceNumber: "" })).toBeNull();
    expect(billedRefusesOutright({ sortOrder: 2 })).toBe(false);
  });
});
