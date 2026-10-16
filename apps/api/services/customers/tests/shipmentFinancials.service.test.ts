import { beforeEach, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => ({
  shipments: { _internalCustomerShipmentIds: vi.fn() },
  fx: { fxJobRates: vi.fn() },
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
  it("answers only the customer's own shipments, at each job's rates, in the order given", async () => {
    clients.shipments._internalCustomerShipmentIds.mockResolvedValue({ shipmentIds: ["s2", "s1"] });
    clients.fx.fxJobRates.mockImplementation(async ({ shipmentId }: { shipmentId: string }) => ({ rates: [{ currency: "EUR", rate: shipmentId === "s1" ? 25 : 24 }] }));
    clients.invoicing._internalShipmentCostTotals.mockResolvedValue({ items: [totals("s1", 100), totals("s2", 200)] });

    const items = await shipmentFinancialsService.forShipments(COMPANY, "c1", ["s2", "s1", "someone-elses"], "EUR");
    expect(clients.shipments._internalCustomerShipmentIds).toHaveBeenCalledWith({ customerId: "c1", shipmentIds: ["s2", "s1", "someone-elses"] });
    expect(clients.invoicing._internalShipmentCostTotals).toHaveBeenCalledWith({
      jobs: [{ shipmentId: "s2", rates: [{ currency: "EUR", rate: 24 }] }, { shipmentId: "s1", rates: [{ currency: "EUR", rate: 25 }] }],
      currency: "EUR",
    });
    expect(items.map((i) => [i.shipmentId, i.revenueCzk, i.currency])).toEqual([["s2", 200, "EUR"], ["s1", 100, "EUR"]]);
  });

  it("gives a job whose rates can't be read no totals instead of failing the list", async () => {
    clients.shipments._internalCustomerShipmentIds.mockResolvedValue({ shipmentIds: ["s1", "s2"] });
    clients.fx.fxJobRates.mockImplementation(async ({ shipmentId }: { shipmentId: string }) => {
      if (shipmentId === "s2") throw new Error("down");
      return { rates: [] };
    });
    clients.invoicing._internalShipmentCostTotals.mockResolvedValue({ items: [totals("s1", 50)] });
    const items = await shipmentFinancialsService.forShipments(COMPANY, "c1", ["s1", "s2"], "CZK");
    expect(items[1]).toMatchObject({ shipmentId: "s2", revenueCzk: null, profit: null });
  });

  it("asks nothing more when none of the shipments is the customer's", async () => {
    clients.shipments._internalCustomerShipmentIds.mockResolvedValue({ shipmentIds: [] });
    await expect(shipmentFinancialsService.forShipments(COMPANY, "c1", ["x"], "CZK")).resolves.toEqual([]);
    expect(clients.fx.fxJobRates).not.toHaveBeenCalled();
  });

  it("takes a 3-letter currency, CZK by default", () => {
    expect(currencyOf(undefined)).toBe("CZK");
    expect(currencyOf(" eur ")).toBe("EUR");
    expect(() => currencyOf("euro")).toThrow("3-letter");
  });
});
