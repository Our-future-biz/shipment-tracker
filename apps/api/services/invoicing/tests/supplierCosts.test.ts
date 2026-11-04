import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const customerGet = vi.hoisted(() => vi.fn());
const basics = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ customers: { customerGet }, shipments: { _internalShipmentBasics: basics } }));
const repo = vi.hoisted(() => ({ openOfSupplier: vi.fn(), openTypedVendors: vi.fn() }));
vi.mock("../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: repo }));

import { nameKey, summarizeSupplierCosts, supplierCostLine, typedNamesOf, type SupplierCostRow } from "../lib/supplierCosts";
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

describe("the totals of What we owe", () => {
  it("add each currency on its own over every line: owed, its overdue part, expected and untracked apart", () => {
    const lines = [
      line({ id: "late", received: true, receivedAt: new Date("2026-09-01T08:00:00Z"), realAmount: "100" }),
      line({ id: "due", received: true, receivedAt: new Date("2026-10-30T08:00:00Z"), realAmount: "50" }),
      line({ id: "noamount", received: true, receivedAt: new Date("2026-10-30T08:00:00Z") }),
      line({ id: "exp", estAmount: "70" }),
      line({ id: "old", received: true, realAmount: "999" }),
      line({ id: "czk", received: true, receivedAt: new Date("2026-10-30T08:00:00Z"), realAmount: "1000", realCurrency: "CZK" }),
    ].filter((l) => l !== null);
    const s = summarizeSupplierCosts(lines);
    expect(s.totals).toEqual([
      { currency: "CZK", owed: 1000, overdue: 0, expected: 0, untracked: 0 },
      { currency: "EUR", owed: 150, overdue: 100, expected: 70, untracked: 999 },
    ]);
    expect(s.owed.map((l) => l.id)).toEqual(["late", "due", "noamount", "czk"]);
    expect(s.expected.map((l) => l.id)).toEqual(["exp"]);
    expect(s.untracked.map((l) => l.id)).toEqual(["old"]);
    expect(s.withoutAmount).toBe(1);
    expect(s.dueUnknown).toBe(0);
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
    customerGet.mockResolvedValue({ customer: { companyName: "Maersk A/S", supplierTerms: { paymentDays: 30 } } });
    repo.openTypedVendors.mockResolvedValue([{ vendor: "Maersk", lines: 2 }]);
    basics.mockImplementation(async ({ ids }: { ids: string[] }) => ({ shipments: ids.filter((id) => id !== "gone").map((id) => ({ id, jobNumber: `CZ-${id}`, status: "In Transit" })) }));
  });

  it("gives the three lists with their job numbers, the totals, the counts and the typed names", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
    repo.openOfSupplier.mockResolvedValue([
      row({ id: "a", received: true, receivedAt: new Date("2026-09-01T08:00:00Z"), realAmount: "10" }),
      row({ id: "b", estAmount: "5" }),
      row({ id: "c", received: true, realAmount: "7" }),
      row({ id: "d", shipmentId: "gone", estAmount: "5" }),
    ]);
    const res = await supplierCostsService.forSupplier("company", SUPPLIER);
    expect(res.owed.map((l) => [l.id, l.jobNumber, l.dueOn, l.overdueDays])).toEqual([["a", "CZ-s1", "2026-10-01", 34]]);
    expect(res.expected.map((l) => l.id)).toEqual(["b"]);
    expect(res.untracked.map((l) => l.id)).toEqual(["c"]);
    expect(res.totals).toEqual([{ currency: "EUR", owed: 10, overdue: 10, expected: 5, untracked: 7 }]);
    expect(res.counts).toEqual({ owed: 1, expected: 1, untracked: 1, withoutAmount: 0, dueUnknown: 0 });
    expect(res.paymentDays).toBe(30);
    expect(res.typedNames).toEqual([{ vendor: "Maersk", lines: 2 }]);
    expect(res.truncated).toBe(false);
    expect(basics).toHaveBeenCalledWith({ ids: ["s1", "gone"] });
    expect(customerGet).toHaveBeenCalledWith({ id: SUPPLIER });
  });

  it("totals every line it reads, names the jobs 500 at a time, and lists only the first of each list", async () => {
    repo.openOfSupplier.mockResolvedValue(Array.from({ length: 1200 }, (_, i) => row({ id: `l${i}`, shipmentId: `s${i}`, estAmount: "1" })));
    const res = await supplierCostsService.forSupplier("company", SUPPLIER);
    expect(repo.openOfSupplier).toHaveBeenCalledWith("company", SUPPLIER, 10_001);
    expect(basics).toHaveBeenCalledTimes(3);
    expect(res.expected).toHaveLength(200);
    expect(res.counts.expected).toBe(1200);
    expect(res.totals[0]!.expected).toBe(1200);
    expect(res.truncated).toBe(false);
  });

  it("asks the shipments service nothing when there are no lines, and refuses what is no company id", async () => {
    repo.openOfSupplier.mockResolvedValue([]);
    expect((await supplierCostsService.forSupplier("company", SUPPLIER)).owed).toEqual([]);
    expect(basics).not.toHaveBeenCalled();
    await expect(supplierCostsService.forSupplier("company", "nope")).rejects.toThrow("Not a company id");
  });
});
