import { beforeEach, describe, expect, it, vi } from "vitest";

// The real side of Trucking's buying rows from an approved haulier invoice: which sourceRefs it
// takes, the row values it writes, and the service refusing a set that does not fit the rows.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("../repositories/truckingLines.repository", () => ({ truckingLinesRepository: { setReal: vi.fn(async () => 2) } }));

import { truckingLinesRepository } from "../repositories/truckingLines.repository";
import { truckingRealService } from "../services/truckingReal.service";
import { checkRealLines, checkRealSourceRef, realRowValues } from "../utils/truckingReal.utils";

const C = "00000000-0000-0000-0000-000000000001";
const S = "00000000-0000-0000-0000-0000000000d1";
const TRIP = "00000000-0000-0000-0000-0000000000f1";
const LEG = "00000000-0000-0000-0000-0000000000e1";

beforeEach(() => vi.clearAllMocks());

describe("Trucking real costs in Costs Breakdown", () => {
  it("takes the buying refs of an FTL trip, an LTL trip's job share and a partner delivery", () => {
    expect(checkRealSourceRef(`trucking:trip:${TRIP}`)).toBe(`trucking:trip:${TRIP}`);
    expect(checkRealSourceRef(`trucking:trip:${TRIP}:job:${S}`)).toBe(`trucking:trip:${TRIP}:job:${S}`);
    expect(checkRealSourceRef(`TRUCKING:LEG:${LEG.toUpperCase()}`)).toBe(`trucking:leg:${LEG}`);
    expect(() => checkRealSourceRef(`trucking:consignment:${TRIP}`)).toThrow();
    expect(() => checkRealSourceRef("trucking:trip:1")).toThrow();
  });

  it("writes the real amount as one (qty 1) with the invoice number, received; null clears it", () => {
    expect(realRowValues({ amount: 9450.5, currency: "EUR", invoiceNumber: "FV 1" }, "2.00")).toEqual({
      realQty: "1.00",
      realAmount: "9450.50",
      realCurrency: "EUR",
      invoiceNumber: "FV 1",
      received: true,
    });
    expect(realRowValues(null, "2.00")).toEqual({ realQty: "2.00", realAmount: null, invoiceNumber: "", received: false });
  });

  it("checks the lines: amount, currency, invoice number", () => {
    expect(checkRealLines([{ amount: 10.004, currency: "czk", invoiceNumber: " FV 1 " }])).toEqual([{ amount: 10, currency: "CZK", invoiceNumber: "FV 1" }]);
    expect(() => checkRealLines([{ amount: Number.NaN, currency: "CZK", invoiceNumber: "FV" }])).toThrow();
    expect(() => checkRealLines([{ amount: 1, currency: "Kč", invoiceNumber: "FV" }])).toThrow();
    expect(() => checkRealLines([{ amount: 1, currency: "CZK", invoiceNumber: " " }])).toThrow();
  });

  it("hands the lines to the repository in order; refuses when they do not fit the rows", async () => {
    const lines = [
      { amount: 9000, currency: "CZK", invoiceNumber: "FV 1" },
      { amount: 1000, currency: "CZK", invoiceNumber: "FV 1" },
    ];
    expect(await truckingRealService.setReal(C, { shipmentId: S, sourceRef: `trucking:trip:${TRIP}`, realLines: lines })).toEqual({ updated: 2 });
    expect(truckingLinesRepository.setReal).toHaveBeenCalledWith(C, S, `trucking:trip:${TRIP}`, lines);
    vi.mocked(truckingLinesRepository.setReal).mockResolvedValueOnce(null);
    await expect(truckingRealService.setReal(C, { shipmentId: S, sourceRef: `trucking:trip:${TRIP}`, realLines: lines })).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(truckingRealService.setReal(C, { shipmentId: "x", sourceRef: `trucking:trip:${TRIP}`, realLines: lines })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});
