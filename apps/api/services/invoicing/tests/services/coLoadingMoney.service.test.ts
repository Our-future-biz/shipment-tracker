import { beforeEach, describe, expect, it, vi } from "vitest";

// A Co-Loading sailing's money (Council Outlay 13) run for real against stand-ins for the repositories and
// fx: each shipment gets its own lines and its own rates, the rates are asked of fx's read that fixes
// nothing with whether each job has an open invoice, and a failed rates read keeps the CZK amounts while
// naming the other currencies - never taking them at 1.
const selling = vi.hoisted(() => ({ listByShipmentIds: vi.fn() }));
vi.mock("../../repositories/sellingCost.repository", () => ({ sellingCostRepository: selling }));
const costs = vi.hoisted(() => ({ listByShipmentIds: vi.fn() }));
vi.mock("../../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: costs }));
const invoices = vi.hoisted(() => ({ listOpenInvoicesWithSources: vi.fn() }));
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: invoices }));
const fx = vi.hoisted(() => ({ _internalFxJobRatesRead: vi.fn() }));
vi.mock("~encore/clients", () => ({ fx }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));

import { coLoadingMoneyService as service } from "../../services/coLoadingMoney.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const A = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const B = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";

const DATES = { tradeDirection: "Import", estimatedArrival: "2026-12-20", estimatedDeparture: "2026-11-20", actualArrival: null, actualDeparture: null };
const job = (shipmentId: string) => ({ shipmentId, ...DATES });
const sell = (over: Record<string, unknown>) => ({ id: "s1", shipmentId: A, category: "ocean_freight", qty: null, amount: null, currency: "CZK", invoice: true, ...over });
const buy = (over: Record<string, unknown>) => ({
  id: "b1", shipmentId: A, category: "customs_import", estQty: null, estAmount: null, estCurrency: "CZK", realQty: null, realAmount: null, realCurrency: "CZK",
  sourceTruckingRef: null, sourceMasterJobRef: null, ...over,
});
const rated = (shipmentId: string, eur: number) => ({ shipmentId, rates: [{ currency: "EUR", rate: eur, fixingDate: "2026-11-20" }] });

beforeEach(() => {
  vi.clearAllMocks();
  // A sells 100 EUR, of which an open invoice bills one row, and has 600 CZK of customs. B sells 2,000 CZK and has an inland delivery of 50 EUR.
  selling.listByShipmentIds.mockResolvedValue([
    sell({ id: "s1", amount: "60", currency: "EUR" }),
    sell({ id: "s2", amount: "40", currency: "EUR" }),
    sell({ id: "s3", shipmentId: B, amount: "2000" }),
  ]);
  costs.listByShipmentIds.mockResolvedValue([buy({ estAmount: "600" }), buy({ id: "b2", shipmentId: B, category: "delivery", estAmount: "50", estCurrency: "EUR" })]);
  invoices.listOpenInvoicesWithSources.mockResolvedValue([{ id: "i1", shipmentId: A, sourceSellingCostIds: ["s1"] }]);
  fx._internalFxJobRatesRead.mockResolvedValue({ jobs: [rated(A, 25), rated(B, 24)], notFixed: [], unreadable: [] });
});

describe("a sailing's shipments' money", () => {
  it("gives each shipment its own lines at its own rates", async () => {
    const [a, b] = await service.forJobs(COMPANY, [job(A), job(B)]);
    expect(a).toMatchObject({ shipmentId: A, sellingCzk: 2500, invoicedCzk: 1500, otherCzk: 600, inlandCzk: 0, eurRate: 25, missingCurrencies: [] });
    expect(b).toMatchObject({ shipmentId: B, sellingCzk: 2000, invoicedCzk: 0, otherCzk: 0, inlandCzk: 1200, eurRate: 24, missingCurrencies: [] });
    expect(costs.listByShipmentIds).toHaveBeenCalledWith(COMPANY, [A, B]);
    expect(selling.listByShipmentIds).toHaveBeenCalledWith(COMPANY, [A, B]);
    expect(invoices.listOpenInvoicesWithSources).toHaveBeenCalledWith([A, B], COMPANY);
  });

  it("asks fx's read that fixes nothing, with each job's dates and whether an open invoice holds its rates", async () => {
    await service.forJobs(COMPANY, [job(A), job(B)]);
    expect(fx._internalFxJobRatesRead).toHaveBeenCalledWith({
      jobs: [
        { shipmentId: A, dates: DATES, invoiced: true },
        { shipmentId: B, dates: DATES, invoiced: false },
      ],
      currencies: ["EUR"],
    });
  });

  it("keeps the CZK amounts and names the other currencies when the rates cannot be read", async () => {
    fx._internalFxJobRatesRead.mockRejectedValue(new Error("fx down"));
    const [a, b] = await service.forJobs(COMPANY, [job(A), job(B)]);
    expect(a).toMatchObject({ sellingCzk: 0, otherCzk: 600, eurRate: null, missingCurrencies: ["EUR"] });
    expect(b).toMatchObject({ sellingCzk: 2000, inlandCzk: 0, eurRate: null, missingCurrencies: ["EUR"] });
  });

  it("treats a job fx could not value like one with no rates, the others valued", async () => {
    fx._internalFxJobRatesRead.mockResolvedValue({ jobs: [rated(B, 24)], notFixed: [], unreadable: [A] });
    const [a, b] = await service.forJobs(COMPANY, [job(A), job(B)]);
    expect(a).toMatchObject({ eurRate: null, missingCurrencies: ["EUR"] });
    expect(b).toMatchObject({ eurRate: 24, inlandCzk: 1200 });
  });

  it("asks nothing for no jobs, and answers each job once", async () => {
    expect(await service.forJobs(COMPANY, [])).toEqual([]);
    expect(fx._internalFxJobRatesRead).not.toHaveBeenCalled();
    expect((await service.forJobs(COMPANY, [job(A), job(A)])).map((m) => m.shipmentId)).toEqual([A]);
  });
});
