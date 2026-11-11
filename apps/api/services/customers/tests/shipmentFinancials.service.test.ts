import { beforeEach, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => ({
  shipments: { _internalCustomerShipmentIds: vi.fn() },
  fx: { _internalFxJobRatesBatch: vi.fn() },
  invoicing: { _internalShipmentCostTotals: vi.fn() },
}));
const requireLive = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => clients);
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => ({ APIError: { invalidArgument: (m: string) => new Error(m) } }));
vi.mock("../services/customer.service", () => ({ customerService: { requireLive } }));

import { currencyOf, shipmentFinancialsService } from "../services/shipmentFinancials.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const totals = (shipmentId: string, revenueCzk: number) => ({
  shipmentId, revenueCzk, costCzk: 0, profitCzk: revenueCzk, revenue: revenueCzk, cost: 0, profit: revenueCzk, missingCurrencies: [],
});

beforeEach(() => vi.clearAllMocks());

describe("shipment financials of a customer", () => {
  // Changed: one fx.fxJobRates call per shipment (each reading the shipment and its invoices) became one batch call.
  it("answers only the customer's own shipments, at each job's rates read in one call, in the order given", async () => {
    clients.shipments._internalCustomerShipmentIds.mockResolvedValue({ shipmentIds: ["s2", "s1"] });
    clients.fx._internalFxJobRatesBatch.mockResolvedValue({
      jobs: [{ shipmentId: "s2", rates: [{ currency: "EUR", rate: 24, fixingDate: "2026-10-13" }] }, { shipmentId: "s1", rates: [{ currency: "EUR", rate: 25, fixingDate: "2026-10-13" }] }],
      unreadable: [],
    });
    clients.invoicing._internalShipmentCostTotals.mockResolvedValue({ items: [totals("s1", 100), totals("s2", 200)] });

    const items = await shipmentFinancialsService.forShipments(COMPANY, "c1", ["s2", "s1", "someone-elses"], "EUR");
    expect(clients.shipments._internalCustomerShipmentIds).toHaveBeenCalledWith({ customerId: "c1", shipmentIds: ["s2", "s1", "someone-elses"] });
    expect(clients.fx._internalFxJobRatesBatch).toHaveBeenCalledTimes(1);
    expect(clients.fx._internalFxJobRatesBatch).toHaveBeenCalledWith({ shipmentIds: ["s2", "s1"] });
    expect(clients.invoicing._internalShipmentCostTotals).toHaveBeenCalledWith({
      jobs: [{ shipmentId: "s2", rates: [{ currency: "EUR", rate: 24 }] }, { shipmentId: "s1", rates: [{ currency: "EUR", rate: 25 }] }],
      currency: "EUR",
    });
    expect(items.map((i) => [i.shipmentId, i.revenueCzk, i.currency])).toEqual([["s2", 200, "EUR"], ["s1", 100, "EUR"]]);
  });

  it("gives a job whose rates can't be read no totals instead of failing the list", async () => {
    clients.shipments._internalCustomerShipmentIds.mockResolvedValue({ shipmentIds: ["s1", "s2"] });
    clients.fx._internalFxJobRatesBatch.mockResolvedValue({ jobs: [{ shipmentId: "s1", rates: [] }], unreadable: ["s2"] });
    clients.invoicing._internalShipmentCostTotals.mockResolvedValue({ items: [totals("s1", 50)] });
    const items = await shipmentFinancialsService.forShipments(COMPANY, "c1", ["s1", "s2"], "CZK");
    expect(clients.invoicing._internalShipmentCostTotals).toHaveBeenCalledWith({ jobs: [{ shipmentId: "s1", rates: [] }], currency: "CZK" });
    expect(items[1]).toMatchObject({ shipmentId: "s2", revenueCzk: null, profit: null });
  });

  it("lists every job without totals when fx does not answer, rather than failing", async () => {
    clients.shipments._internalCustomerShipmentIds.mockResolvedValue({ shipmentIds: ["s1", "s2"] });
    clients.fx._internalFxJobRatesBatch.mockRejectedValue(new Error("fx down"));
    const items = await shipmentFinancialsService.forShipments(COMPANY, "c1", ["s1", "s2"], "CZK");
    expect(clients.invoicing._internalShipmentCostTotals).not.toHaveBeenCalled();
    expect(items.map((i) => [i.shipmentId, i.revenueCzk])).toEqual([["s1", null], ["s2", null]]);
  });

  it("asks nothing more when none of the shipments is the customer's", async () => {
    clients.shipments._internalCustomerShipmentIds.mockResolvedValue({ shipmentIds: [] });
    await expect(shipmentFinancialsService.forShipments(COMPANY, "c1", ["x"], "CZK")).resolves.toEqual([]);
    expect(clients.fx._internalFxJobRatesBatch).not.toHaveBeenCalled();
  });

  it("takes a 3-letter currency, CZK by default", () => {
    expect(currencyOf(undefined)).toBe("CZK");
    expect(currencyOf(" eur ")).toBe("EUR");
    expect(() => currencyOf("euro")).toThrow("3-letter");
  });
});
