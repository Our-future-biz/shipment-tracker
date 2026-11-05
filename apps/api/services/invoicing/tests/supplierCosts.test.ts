import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const customerGet = vi.hoisted(() => vi.fn());
const basics = vi.hoisted(() => vi.fn());
const unpaidInvoices = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ customers: { customerGet }, shipments: { _internalShipmentBasics: basics }, trucking: { _internalHaulierInvoicesUnpaid: unpaidInvoices } }));
const repo = vi.hoisted(() => ({
  openReceivedTotals: vi.fn(),
  openExpectedByShipment: vi.fn(),
  openOwed: vi.fn(),
  openUntracked: vi.fn(),
  openExpected: vi.fn(),
  openTypedVendors: vi.fn(),
  linkedShipments: vi.fn(),
}));
vi.mock("../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: repo }));

import {
  haulierInvoiceLine,
  nameKey,
  seesTruckingConcept,
  summarizeHaulierInvoices,
  supplierCostLine,
  supplierCostLists,
  supplierCostTotals,
  typedNamesOf,
  type ReceivedTotalsRow,
  type SupplierCostRow,
  type UnpaidHaulierInvoiceRow,
} from "../lib/supplierCosts";
import { supplierCostsService } from "../services/supplierCosts.service";

const SUPPLIER = "3d55a500-d6f8-4def-8e95-82e77493cabb";
const row = (over: Partial<SupplierCostRow> = {}): SupplierCostRow => ({
  id: "c1", shipmentId: "s1", category: "ocean_freight", description: "Ocean freight", invoiceNumber: "", received: false, receivedAt: null,
  estQty: null, estAmount: null, estCurrency: "EUR", realQty: null, realAmount: null, realCurrency: "EUR", ...over,
});
const JOB = { jobNumber: "CZ00000021", status: "In Transit" };

const TODAY = "2026-11-04";
const line = (r: Partial<SupplierCostRow>, job = JOB, days: number | null = 30) => supplierCostLine(row(r), job, days, TODAY);

describe("a supplier's cost line in What we owe", () => {
  it("owes a received line its real cost (quantity × price), due its received day (Prague) + the payment days", () => {
    // 23:30 UTC on 1 Oct is 2 Oct in Prague: due 1 Nov, 3 days overdue on 4 Nov.
    const at = new Date("2026-10-01T23:30:00Z");
    expect(line({ received: true, receivedAt: at, realQty: "2", realAmount: "150.50", realCurrency: "USD", invoiceNumber: "INV-7" })).toEqual({
      id: "c1", shipmentId: "s1", jobNumber: "CZ00000021", category: "ocean_freight", description: "Ocean freight", invoiceNumber: "INV-7",
      kind: "owed", receivedAt: at.toISOString(), dueOn: "2026-11-01", overdueDays: 3, amount: 301, currency: "USD",
    });
  });

  it("is not overdue on its due day, and has no due day without payment days", () => {
    expect(line({ received: true, receivedAt: new Date("2026-10-05T08:00:00Z"), realAmount: "1" })).toMatchObject({ dueOn: TODAY, overdueDays: 0 });
    expect(line({ received: true, receivedAt: new Date("2026-10-05T08:00:00Z"), realAmount: "1" }, JOB, null)).toMatchObject({ dueOn: "", overdueDays: 0 });
  });

  it("keeps a received line with no real cost typed, without an amount", () => {
    expect(line({ received: true, receivedAt: new Date(), estAmount: "100" })).toMatchObject({ kind: "owed", amount: null });
  });

  it("lists a line ticked Received before that day was kept as untracked (K2)", () => {
    expect(line({ received: true, realAmount: "100" })).toMatchObject({ kind: "untracked", receivedAt: null, dueOn: "", amount: 100 });
  });

  it("expects a line not received: its real cost once typed, else the estimate", () => {
    expect(line({ estQty: "3", estAmount: "10" })).toMatchObject({ kind: "expected", amount: 30, currency: "EUR" });
    expect(line({ estAmount: "10", realAmount: "12", realCurrency: "CZK" })).toMatchObject({ amount: 12, currency: "CZK" });
  });

  it("shows nothing for an expected line with no amount, one on a cancelled job, or one whose job is gone", () => {
    expect(line({})).toBeNull();
    expect(line({ estAmount: "0" })).toBeNull();
    expect(line({ estAmount: "10" }, { ...JOB, status: "Cancelled Shipment" })).toBeNull();
    expect(supplierCostLine(row({ estAmount: "10" }), undefined, 30, TODAY)).toBeNull();
    // What was received on a cancelled job is still owed.
    expect(line({ received: true, receivedAt: new Date(), realAmount: "5" }, { ...JOB, status: "Cancelled Shipment" })).toMatchObject({ amount: 5 });
  });
});

const received = (over: Partial<ReceivedTotalsRow> = {}): ReceivedTotalsRow => ({
  currency: "EUR", owed: "0", overdue: "0", untracked: "0", owedLines: 0, withoutAmount: 0, untrackedLines: 0, withAmount: 1, ...over,
});

describe("the totals of What we owe", () => {
  const jobs = new Map([
    ["s1", JOB],
    ["s2", { ...JOB, status: "Cancelled Shipment" }],
  ]);

  it("put each currency's sums from the database together: owed, its overdue part, untracked, and what is expected on live jobs", () => {
    const res = supplierCostTotals(
      [
        received({ currency: "EUR", owed: "150.00", overdue: "100.00", untracked: "999.00", owedLines: 3, withoutAmount: 1, untrackedLines: 1 }),
        received({ currency: "CZK", owed: "1000.00", owedLines: 1 }),
        // only lines with no real cost typed: no total of their own
        received({ currency: "USD", owedLines: 2, withoutAmount: 2, withAmount: 0 }),
      ],
      [
        { shipmentId: "s1", currency: "EUR", amount: "70.00", lines: 2 },
        // a cancelled job's and a job gone are not expected
        { shipmentId: "s2", currency: "EUR", amount: "500.00", lines: 1 },
        { shipmentId: "gone", currency: "PLN", amount: "5.00", lines: 1 },
      ],
      jobs,
      30,
    );
    expect(res.totals).toEqual([
      { currency: "CZK", owed: 1000, overdue: 0, expected: 0, untracked: 0 },
      { currency: "EUR", owed: 150, overdue: 100, expected: 70, untracked: 999 },
    ]);
    expect(res.counts).toEqual({ owed: 6, expected: 2, untracked: 1, withoutAmount: 3, dueUnknown: 0 });
  });

  it("know no owed line's due day without payment days", () => {
    expect(supplierCostTotals([received({ owed: "5", owedLines: 4 })], [], jobs, null).counts).toMatchObject({ owed: 4, dueUnknown: 4 });
  });
});

describe("the lines listed in What we owe", () => {
  it("list owed most urgent first, expected and untracked the newest job first", () => {
    const lines = [
      line({ id: "due", received: true, receivedAt: new Date("2026-10-30T08:00:00Z"), realAmount: "50" }),
      line({ id: "late", received: true, receivedAt: new Date("2026-09-01T08:00:00Z"), realAmount: "100" }),
      line({ id: "exp-old", estAmount: "70" }, { jobNumber: "CZ00000020", status: "In Transit" }),
      line({ id: "exp-new", estAmount: "70" }, { jobNumber: "CZ00000030", status: "In Transit" }),
      line({ id: "old", received: true, realAmount: "999" }),
    ].filter((l) => l !== null);
    const res = supplierCostLists(lines);
    expect(res.owed.map((l) => l.id)).toEqual(["late", "due"]);
    expect(res.expected.map((l) => l.id)).toEqual(["exp-new", "exp-old"]);
    expect(res.untracked.map((l) => l.id)).toEqual(["old"]);
  });
});

const unpaid = (over: Partial<UnpaidHaulierInvoiceRow> = {}): UnpaidHaulierInvoiceRow => ({
  id: "h1", invoiceNumber: "FV-1", issueDate: "2026-10-01", dueDate: "2026-10-31", totalGross: 1210, currency: "CZK", paymentTracked: true, ...over,
});

describe("a haulier's Trucking invoices in What we owe (C-1)", () => {
  it("are owed by their own due day, with VAT; one approved before payments were noted here is untracked, never overdue (K2)", () => {
    expect(haulierInvoiceLine(unpaid(), TODAY)).toEqual({ id: "h1", invoiceNumber: "FV-1", kind: "owed", issueDate: "2026-10-01", dueOn: "2026-10-31", overdueDays: 4, amount: 1210, currency: "CZK" });
    expect(haulierInvoiceLine(unpaid({ dueDate: TODAY }), TODAY)).toMatchObject({ overdueDays: 0 });
    expect(haulierInvoiceLine(unpaid({ dueDate: null }), TODAY)).toMatchObject({ dueOn: "", overdueDays: 0 });
    expect(haulierInvoiceLine(unpaid({ paymentTracked: false }), TODAY)).toMatchObject({ kind: "untracked", overdueDays: 0 });
  });

  it("are totalled per currency over all of them, the most urgent listed first, and counted", () => {
    const res = summarizeHaulierInvoices(
      [
        unpaid({ id: "soon", dueDate: "2026-11-20", totalGross: 100 }),
        unpaid({ id: "late", dueDate: "2026-10-01", totalGross: 200 }),
        unpaid({ id: "nodue", dueDate: null, totalGross: 50, currency: "EUR" }),
        unpaid({ id: "old1", paymentTracked: false, issueDate: "2025-01-01", totalGross: 7 }),
        unpaid({ id: "old2", paymentTracked: false, issueDate: "2025-03-01", totalGross: 8 }),
      ],
      TODAY,
      { owed: 2, untracked: 1 },
    );
    expect(res.owed.map((l) => l.id)).toEqual(["late", "soon"]);
    expect(res.untracked.map((l) => l.id)).toEqual(["old2"]);
    expect(res.totals).toEqual([
      { currency: "CZK", owed: 300, overdue: 200, untracked: 15 },
      { currency: "EUR", owed: 50, overdue: 0, untracked: 0 },
    ]);
    expect(res.counts).toEqual({ owed: 3, untracked: 2, dueUnknown: 1 });
  });

  it("are seen by those who see the Trucking Concept: superadmins", () => {
    expect(seesTruckingConcept("superadmin")).toBe(true);
    for (const role of ["admin", "manager", "user"]) expect(seesTruckingConcept(role)).toBe(false);
  });
});

describe("typed vendor names", () => {
  it("match a company name without case, accents, punctuation or legal form", () => {
    expect(nameKey("ČD Cargo, a.s.")).toBe("cd cargo");
    expect(nameKey("Maersk A/S")).toBe("maersk");
    expect(nameKey("Raben Logistics Czech s.r.o.")).toBe("raben logistics czech");
    expect(nameKey("K+N spol. s r. o.")).toBe("k n");
    expect(nameKey("DSV Road GmbH")).toBe("dsv road");
    // A name that is only a legal form keeps it.
    expect(nameKey("AG")).toBe("ag");
  });

  it("are named with their counts, most lines first; other names are left out", () => {
    const groups = [
      { vendor: "maersk", lines: 1 },
      { vendor: "MAERSK A/S", lines: 3 },
      { vendor: "Maersk Line", lines: 4 },
      { vendor: "  ", lines: 2 },
    ];
    expect(typedNamesOf(groups, "Maersk A/S")).toEqual([
      { vendor: "MAERSK A/S", lines: 3 },
      { vendor: "maersk", lines: 1 },
    ]);
    expect(typedNamesOf(groups, "")).toEqual([]);
  });
});

describe("reading What we owe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    customerGet.mockResolvedValue({ customer: { companyName: "Maersk A/S", roles: ["shipping_line"], supplierTerms: { paymentDays: 30 } } });
    repo.openTypedVendors.mockResolvedValue([{ vendor: "Maersk", lines: 2 }]);
    repo.openReceivedTotals.mockResolvedValue([]);
    repo.openExpectedByShipment.mockResolvedValue([]);
    repo.openOwed.mockResolvedValue([]);
    repo.openUntracked.mockResolvedValue([]);
    repo.openExpected.mockResolvedValue([]);
    basics.mockImplementation(async ({ ids }: { ids: string[] }) => ({
      shipments: ids.filter((id) => id !== "gone").map((id) => ({ id, jobNumber: `CZ-${id}`, status: id === "cancelled" ? "Cancelled Shipment" : "In Transit" })),
    }));
  });

  it("gives the three lists with their job numbers, the database's totals over every line, the counts and the typed names", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
    repo.openReceivedTotals.mockResolvedValue([received({ owed: "1000.00", overdue: "400.00", untracked: "7.00", owedLines: 800, untrackedLines: 1 })]);
    repo.openExpectedByShipment.mockResolvedValue([
      { shipmentId: "s2", currency: "EUR", amount: "5.00", lines: 1 },
      { shipmentId: "cancelled", currency: "EUR", amount: "99.00", lines: 3 },
    ]);
    repo.openOwed.mockResolvedValue([row({ id: "a", received: true, receivedAt: new Date("2026-09-01T08:00:00Z"), realAmount: "10" })]);
    repo.openUntracked.mockResolvedValue([row({ id: "c", shipmentId: "s3", received: true, realAmount: "7" })]);
    repo.openExpected.mockResolvedValue([row({ id: "b", shipmentId: "s2", estAmount: "5" })]);
    const res = await supplierCostsService.forSupplier("company", SUPPLIER, "admin");
    // The totals are over all of them, not the 300 listed (C-2); the owed total is never cut by the other lists.
    expect(repo.openReceivedTotals).toHaveBeenCalledWith("company", SUPPLIER, 30, "2026-11-04");
    expect(repo.openOwed).toHaveBeenCalledWith("company", SUPPLIER, 300);
    expect(repo.openUntracked).toHaveBeenCalledWith("company", SUPPLIER, 200);
    // The expected lines listed leave out the cancelled job's.
    expect(repo.openExpected).toHaveBeenCalledWith("company", SUPPLIER, ["cancelled"], 200);
    expect(res.owed.map((l) => [l.id, l.jobNumber, l.dueOn, l.overdueDays])).toEqual([["a", "CZ-s1", "2026-10-01", 34]]);
    expect(res.expected.map((l) => l.id)).toEqual(["b"]);
    expect(res.untracked.map((l) => l.id)).toEqual(["c"]);
    expect(res.totals).toEqual([{ currency: "EUR", owed: 1000, overdue: 400, expected: 5, untracked: 7 }]);
    expect(res.counts).toEqual({ owed: 800, expected: 1, untracked: 1, withoutAmount: 0, dueUnknown: 0 });
    expect(res.paymentDays).toBe(30);
    expect(res.typedNames).toEqual([{ vendor: "Maersk", lines: 2 }]);
    // No haulier: Trucking is not asked.
    expect(res.haulierInvoices).toMatchObject({ status: "none", owed: [], totals: [] });
    expect(unpaidInvoices).not.toHaveBeenCalled();
    expect(customerGet).toHaveBeenCalledWith({ id: SUPPLIER });
  });

  it("names the jobs 500 at a time, the calls at once", async () => {
    repo.openExpectedByShipment.mockResolvedValue(Array.from({ length: 1200 }, (_, i) => ({ shipmentId: `s${i}`, currency: "EUR", amount: "1.00", lines: 1 })));
    const res = await supplierCostsService.forSupplier("company", SUPPLIER, "admin");
    expect(basics).toHaveBeenCalledTimes(3);
    expect(res.counts.expected).toBe(1200);
    expect(res.totals[0]!.expected).toBe(1200);
  });

  it("asks the shipments service nothing when there are no lines, and refuses what is no company id", async () => {
    expect((await supplierCostsService.forSupplier("company", SUPPLIER, "admin")).owed).toEqual([]);
    expect(basics).not.toHaveBeenCalled();
    await expect(supplierCostsService.forSupplier("company", "nope", "admin")).rejects.toThrow("Not a company id");
  });

  describe("of a haulier", () => {
    beforeEach(() => {
      customerGet.mockResolvedValue({ customer: { companyName: "Bravo Trans", roles: ["haulier"], supplierTerms: { paymentDays: 30 } } });
    });

    it("brings its approved Trucking invoices not yet paid, apart and with VAT, for a superadmin (who sees the Trucking Concept)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
      unpaidInvoices.mockResolvedValue({ invoices: [unpaid(), unpaid({ id: "old", paymentTracked: false, totalGross: 50 })], truncated: false });
      const res = await supplierCostsService.forSupplier("company", SUPPLIER, "superadmin");
      expect(unpaidInvoices).toHaveBeenCalledWith({ customerId: SUPPLIER });
      expect(res.haulierInvoices).toEqual({
        status: "included",
        owed: [{ id: "h1", invoiceNumber: "FV-1", kind: "owed", issueDate: "2026-10-01", dueOn: "2026-10-31", overdueDays: 4, amount: 1210, currency: "CZK" }],
        untracked: [expect.objectContaining({ id: "old", kind: "untracked" })],
        totals: [{ currency: "CZK", owed: 1210, overdue: 1210, untracked: 50 }],
        counts: { owed: 1, untracked: 1, dueUnknown: 0 },
        truncated: false,
      });
      // Never added to the shipment costs' totals (without VAT).
      expect(res.totals).toEqual([]);
    });

    it("leaves them out for anyone else, saying so, and asks Trucking nothing", async () => {
      for (const role of ["admin", "manager", "user"]) {
        expect((await supplierCostsService.forSupplier("company", SUPPLIER, role)).haulierInvoices).toMatchObject({ status: "hidden", owed: [], untracked: [], totals: [] });
      }
      expect(unpaidInvoices).not.toHaveBeenCalled();
    });

    it("still shows the shipment costs when Trucking cannot be read, saying so", async () => {
      unpaidInvoices.mockRejectedValue(new Error("down"));
      repo.openReceivedTotals.mockResolvedValue([received({ owed: "10", owedLines: 1 })]);
      const res = await supplierCostsService.forSupplier("company", SUPPLIER, "superadmin");
      expect(res.haulierInvoices.status).toBe("unavailable");
      expect(res.totals).toEqual([{ currency: "EUR", owed: 10, overdue: 0, expected: 0, untracked: 0 }]);
    });
  });
});

describe("how a supplier is used (m21)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("counts its jobs that are neither billed nor cancelled, and says when it was last put on one", async () => {
    const at = new Date("2026-10-30T08:00:00Z");
    repo.linkedShipments.mockResolvedValue([
      { shipmentId: "s1", lastAt: at },
      { shipmentId: "s2", lastAt: new Date("2026-09-01T08:00:00Z") },
      { shipmentId: "s3", lastAt: new Date("2026-08-01T08:00:00Z") },
      { shipmentId: "gone", lastAt: new Date("2026-07-01T08:00:00Z") },
    ]);
    basics.mockResolvedValue({
      shipments: [
        { id: "s1", jobNumber: "CZ-1", status: "In Transit [IMP]" },
        { id: "s2", jobNumber: "CZ-2", status: "Billed [EXP]" },
        { id: "s3", jobNumber: "CZ-3", status: "Cancelled Shipment" },
      ],
    });
    expect(await supplierCostsService.usage("company", SUPPLIER)).toEqual({ openJobs: 1, capped: false, lastUsedAt: at.toISOString() });
    expect(repo.linkedShipments).toHaveBeenCalledWith("company", SUPPLIER, 2001);
  });

  it("has nothing to say about a supplier never put on a job, and asks the shipments service nothing", async () => {
    repo.linkedShipments.mockResolvedValue([]);
    expect(await supplierCostsService.usage("company", SUPPLIER)).toEqual({ openJobs: 0, capped: false, lastUsedAt: null });
    expect(basics).not.toHaveBeenCalled();
  });
});
