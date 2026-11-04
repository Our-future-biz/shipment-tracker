import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const customerGet = vi.hoisted(() => vi.fn());
const basics = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ customers: { customerGet }, shipments: { _internalShipmentBasics: basics } }));
const repo = vi.hoisted(() => ({ openOfSupplier: vi.fn(), openTypedVendors: vi.fn() }));
vi.mock("../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: repo }));

import { nameKey, supplierCostLine, typedNamesOf, type SupplierCostRow } from "../lib/supplierCosts";
import { supplierCostsService } from "../services/supplierCosts.service";

const SUPPLIER = "3d55a500-d6f8-4def-8e95-82e77493cabb";
const row = (over: Partial<SupplierCostRow> = {}): SupplierCostRow => ({
  id: "c1", shipmentId: "s1", category: "ocean_freight", description: "Ocean freight", invoiceNumber: "", received: false, receivedAt: null,
  estQty: null, estAmount: null, estCurrency: "EUR", realQty: null, realAmount: null, realCurrency: "EUR", ...over,
});
const JOB = { jobNumber: "CZ00000021", status: "In Transit" };

describe("a supplier's cost line in What we owe", () => {
  it("owes a received line its real cost (quantity × price), with the day it was received", () => {
    const at = new Date("2026-11-02T09:00:00Z");
    expect(supplierCostLine(row({ received: true, receivedAt: at, realQty: "2", realAmount: "150.50", realCurrency: "USD", invoiceNumber: "INV-7" }), JOB)).toEqual({
      id: "c1", shipmentId: "s1", jobNumber: "CZ00000021", category: "ocean_freight", description: "Ocean freight", invoiceNumber: "INV-7",
      received: true, receivedAt: at.toISOString(), amount: 301, currency: "USD",
    });
  });

  it("keeps a received line with no real cost typed, without an amount", () => {
    expect(supplierCostLine(row({ received: true, estAmount: "100" }), JOB)).toMatchObject({ received: true, amount: null, receivedAt: null });
  });

  it("expects a line not received: its real cost once typed, else the estimate", () => {
    expect(supplierCostLine(row({ estQty: "3", estAmount: "10" }), JOB)).toMatchObject({ received: false, amount: 30, currency: "EUR" });
    expect(supplierCostLine(row({ estAmount: "10", realAmount: "12", realCurrency: "CZK" }), JOB)).toMatchObject({ amount: 12, currency: "CZK" });
  });

  it("shows nothing for an expected line with no amount, one on a cancelled job, or one whose job is gone", () => {
    expect(supplierCostLine(row(), JOB)).toBeNull();
    expect(supplierCostLine(row({ estAmount: "0" }), JOB)).toBeNull();
    expect(supplierCostLine(row({ estAmount: "10" }), { ...JOB, status: "Cancelled Shipment" })).toBeNull();
    expect(supplierCostLine(row({ estAmount: "10" }), undefined)).toBeNull();
    // What was received on a cancelled job is still owed.
    expect(supplierCostLine(row({ received: true, realAmount: "5" }), { ...JOB, status: "Cancelled Shipment" })).toMatchObject({ amount: 5 });
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
    customerGet.mockResolvedValue({ customer: { companyName: "Maersk A/S" } });
    repo.openTypedVendors.mockResolvedValue([{ vendor: "Maersk", lines: 2 }]);
    basics.mockResolvedValue({ shipments: [{ id: "s1", jobNumber: "CZ00000021", status: "In Transit" }] });
  });

  it("gives the lines with their job numbers and the typed names, reading each job once", async () => {
    repo.openOfSupplier.mockResolvedValue([row({ id: "a", received: true, realAmount: "10" }), row({ id: "b", estAmount: "5" }), row({ id: "c", shipmentId: "gone", estAmount: "5" })]);
    const res = await supplierCostsService.forSupplier("company", SUPPLIER);
    expect(res.lines.map((l) => [l.id, l.jobNumber, l.received, l.amount])).toEqual([
      ["a", "CZ00000021", true, 10],
      ["b", "CZ00000021", false, 5],
    ]);
    expect(res.typedNames).toEqual([{ vendor: "Maersk", lines: 2 }]);
    expect(res.truncated).toBe(false);
    expect(basics).toHaveBeenCalledWith({ ids: ["s1", "gone"] });
    expect(customerGet).toHaveBeenCalledWith({ id: SUPPLIER });
  });

  it("reads at most 500 lines and says when there were more", async () => {
    repo.openOfSupplier.mockResolvedValue(Array.from({ length: 501 }, (_, i) => row({ id: `l${i}`, estAmount: "1" })));
    const res = await supplierCostsService.forSupplier("company", SUPPLIER);
    expect(repo.openOfSupplier).toHaveBeenCalledWith("company", SUPPLIER, 501);
    expect(res.lines).toHaveLength(500);
    expect(res.truncated).toBe(true);
  });

  it("asks the shipments service nothing when there are no lines, and refuses what is no company id", async () => {
    repo.openOfSupplier.mockResolvedValue([]);
    expect((await supplierCostsService.forSupplier("company", SUPPLIER)).lines).toEqual([]);
    expect(basics).not.toHaveBeenCalled();
    await expect(supplierCostsService.forSupplier("company", "nope")).rejects.toThrow("Not a company id");
  });
});
