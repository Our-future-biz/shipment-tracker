import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const countOpenInvoices = vi.hoisted(() => vi.fn());
const firstBilledAt = vi.hoisted(() => vi.fn());
const byId = vi.hoisted(() => vi.fn());
vi.mock("../repositories/invoice.repository", () => ({ invoiceRepository: { countOpenInvoices, firstBilledAt } }));
vi.mock("../repositories/supplierInvoice.repository", () => ({ supplierInvoiceRepository: { byId } }));

import {
  BILLED,
  BILLED_LATE_DECIDED,
  BILLED_NUMBER_FIRST,
  BILLED_REAL_COST_IN,
  assertNotBilled,
  billedBuyingProblem,
  billedLateRealCosts,
  billedRefusesOutright,
  lateRealCost,
  lateRealCostOf,
  leavesBuyingCostAlone,
} from "../lib/billedLock";

beforeEach(() => {
  countOpenInvoices.mockReset();
  firstBilledAt.mockReset();
  byId.mockReset();
});

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

describe("a late real cost on a billed shipment (mock council M1)", () => {
  const BILLED_AT = new Date("2026-11-10T10:00:00Z");
  const after = new Date("2026-11-12T09:00:00Z");
  const before = new Date("2026-11-01T09:00:00Z");
  const booked = { status: "booked", paidOn: null };

  it("is a real cost that came on the line after the billing: open while its invoice is booked, decided once approved or paid", () => {
    expect(lateRealCostOf(after, booked, BILLED_AT)).toBe("open");
    expect(lateRealCostOf(after, { status: "approved", paidOn: null }, BILLED_AT)).toBe("decided");
    expect(lateRealCostOf(after, { status: "approved", paidOn: "2026-11-15" }, BILLED_AT)).toBe("decided");
  });

  it("is none for a real cost that came before the billing or at it, or one not known when (there before it was kept), a refused invoice, or with no billing or invoice", () => {
    expect(lateRealCostOf(before, booked, BILLED_AT)).toBeNull();
    expect(lateRealCostOf(BILLED_AT, booked, BILLED_AT)).toBeNull();
    // System-21 mock council review: an older line's real cost has no stamp - it stays as billed.
    expect(lateRealCostOf(null, booked, BILLED_AT)).toBeNull();
    expect(lateRealCostOf(after, { status: "refused", paidOn: null }, BILLED_AT)).toBeNull();
    expect(lateRealCostOf(after, null, BILLED_AT)).toBeNull();
    expect(lateRealCostOf(after, booked, null)).toBeNull();
  });

  it("stays open to its quantity, amount and currency until then, and only those", () => {
    const line = { invoiceNumber: "DHL-7781", realAmount: "1450.00" };
    expect(billedBuyingProblem({ realCurrency: "USD" }, line, "open")).toBeNull();
    expect(billedBuyingProblem({ realAmount: "1405" }, line, "open")).toBeNull();
    expect(billedBuyingProblem({ realQty: "2" }, line, "open")).toBeNull();
    expect(billedBuyingProblem({ realAmount: "1405", estAmount: "1" }, line, "open")).toBe(BILLED);
    // The number is still needed with it.
    expect(billedBuyingProblem({ invoiceNumber: "", realAmount: "1405" }, line, "open")).toBe(BILLED_NUMBER_FIRST);
    expect(billedBuyingProblem({ realAmount: "1405" }, line, "decided")).toBe(BILLED_LATE_DECIDED);
    expect(billedBuyingProblem({ realAmount: "1405" }, line, null)).toBe(BILLED_REAL_COST_IN);
  });

  it("is read only for a line with a real cost that came at a known moment on a supplier invoice, its invoice only when it came after the billing", async () => {
    await expect(lateRealCost("s", "c", { realAmount: null, realCostAt: null, supplierInvoiceId: "si" })).resolves.toBeNull();
    await expect(lateRealCost("s", "c", { realAmount: "10.00", realCostAt: after, supplierInvoiceId: null })).resolves.toBeNull();
    await expect(lateRealCost("s", "c", { realAmount: "10.00", realCostAt: null, supplierInvoiceId: "si" })).resolves.toBeNull();
    expect(firstBilledAt).not.toHaveBeenCalled();
    firstBilledAt.mockResolvedValue(BILLED_AT);
    // System-21 mock council review: an invoice record made after the billing (a backfill, a relink, a number typed
    // late) opens no real cost that came before it - its date is not even read.
    byId.mockResolvedValue({ createdAt: after, status: "booked", paidOn: null });
    await expect(lateRealCost("s", "c", { realAmount: "10.00", realCostAt: before, supplierInvoiceId: "si" })).resolves.toBeNull();
    expect(byId).not.toHaveBeenCalled();
    await expect(lateRealCost("s", "c", { realAmount: "10.00", realCostAt: after, supplierInvoiceId: "si" })).resolves.toBe("open");
    expect(byId).toHaveBeenCalledWith("c", "si");
  });

  it("names the lines Costs Breakdown keeps open, reading each invoice once", async () => {
    firstBilledAt.mockResolvedValue(BILLED_AT);
    byId.mockImplementation(async (_c: string, id: string) => (id === "late" ? { status: "booked", paidOn: null } : { status: "approved", paidOn: null }));
    const open = await billedLateRealCosts("s", "c", [
      { id: "a", realAmount: "1.00", realCostAt: after, supplierInvoiceId: "late" },
      { id: "b", realAmount: "2.00", realCostAt: after, supplierInvoiceId: "late" },
      { id: "c", realAmount: "3.00", realCostAt: after, supplierInvoiceId: "approved" },
      { id: "d", realAmount: null, realCostAt: null, supplierInvoiceId: "late" },
      { id: "e", realAmount: "5.00", realCostAt: after, supplierInvoiceId: null },
      // In before the billing, on the same booked invoice: it stays as billed.
      { id: "f", realAmount: "6.00", realCostAt: before, supplierInvoiceId: "late" },
      { id: "g", realAmount: "7.00", realCostAt: null, supplierInvoiceId: "late" },
    ]);
    expect([...open]).toEqual(["a", "b"]);
    expect(byId).toHaveBeenCalledTimes(2);
  });

  it("reads nothing when no line asks, and names none on a shipment not billed", async () => {
    await expect(billedLateRealCosts("s", "c", [{ id: "a", realAmount: null, realCostAt: null, supplierInvoiceId: null }])).resolves.toEqual(new Set());
    expect(firstBilledAt).not.toHaveBeenCalled();
    firstBilledAt.mockResolvedValue(null);
    await expect(billedLateRealCosts("s", "c", [{ id: "a", realAmount: "1.00", realCostAt: after, supplierInvoiceId: "si" }])).resolves.toEqual(new Set());
    expect(byId).not.toHaveBeenCalled();
  });
});
