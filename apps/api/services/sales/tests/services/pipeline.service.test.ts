import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real, with the rules of the board, against stand-ins for the three
// services it asks: customers, quotes and shipments.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({
  customers: { _internalCustomerPipelineList: vi.fn() },
  quotes: { _internalSalesQuoteCustomerFacts: vi.fn() },
  shipments: { _internalShipmentCustomerFacts: vi.fn() },
}));

import { customers, quotes, shipments } from "~encore/clients";
import { pipelineService } from "../../services/pipeline.service";

const customerList = vi.mocked(customers._internalCustomerPipelineList);
const quoteFacts = vi.mocked(quotes._internalSalesQuoteCustomerFacts);
const shipmentFacts = vi.mocked(shipments._internalShipmentCustomerFacts);

const customer = (id: string, status: "Active" | "Prospect" | "Inactive", createdAt: string) => ({ id, companyName: `${id} s.r.o.`, status, label: "STANDARD" as const, salesOwner: "Martin", createdAt });
const prospects = (n: number) => Array.from({ length: n }, (_, i) => customer(`p${String(i).padStart(3, "0")}`, "Prospect", new Date(Date.UTC(2026, 0, 1 + i)).toISOString()));

beforeEach(() => {
  vi.resetAllMocks();
  // As read locally on 2026-10-10: RAVAK has shipments, ITTEC a sent quote, VP industry neither.
  customerList.mockResolvedValue({
    data: [customer("ravak", "Active", "2026-08-01T08:00:00.000Z"), customer("ittec", "Prospect", "2026-09-01T08:00:00.000Z"), customer("vp", "Prospect", "2026-09-20T08:00:00.000Z")],
  });
  quoteFacts.mockResolvedValue({
    customers: [
      { customerId: "ittec", hasSentQuote: true, sentQuotes: 1, firstSentAt: "2026-10-10T19:17:10.056Z", firstSentAtKnown: true, sentQuotesWithoutDate: 0, lastActivityAt: "2026-10-10T19:17:34.487Z" },
    ],
    openQuotes: [{ customerId: "ittec", quoteNumber: "QCZ20261010001", status: "quoted", validUntil: "2026-10-25", currency: "EUR", fx: null, rates: null, sellingLines: [] }],
    quotesWithoutCustomer: 0,
  });
  shipmentFacts.mockResolvedValue({
    customers: [{ customerId: "ravak", firstShipmentAt: "2026-09-15T08:00:00.000Z", firstShipmentId: "shipment-1", firstJobNumber: "CZ00000012", lastShipmentAt: "2026-10-06T08:00:00.000Z", shipmentCount: 2 }],
    shipmentsWithoutCustomer: 19,
  });
});

describe("board", () => {
  it("asks the three services once each and joins their facts into the three columns", async () => {
    const board = await pipelineService.board({});
    expect(customerList).toHaveBeenCalledTimes(1);
    expect(quoteFacts).toHaveBeenCalledTimes(1);
    expect(shipmentFacts).toHaveBeenCalledTimes(1);
    expect(board.wonSince).toBeNull();
    expect(board.totals).toEqual({ prospect: 1, proposal: 1, won: 1 });
    expect(board.cards.won.map((card) => card.companyName)).toEqual(["ravak s.r.o."]);
    expect(board.cards.proposal.map((card) => card.companyName)).toEqual(["ittec s.r.o."]);
    expect(board.cards.prospect.map((card) => card.companyName)).toEqual(["vp s.r.o."]);
    expect(board.cards.proposal[0]!.openQuotes.map((quote) => quote.quoteNumber)).toEqual(["QCZ20261010001"]);
    expect(board.notes).toEqual({ shipmentsWithoutCustomer: 19, quotesWithoutCustomer: 0, quotesOfMissingCustomers: 0, sentQuotesWithoutDate: 0 });
  });

  it("limits the Won column to the period asked for and leaves the other columns alone", async () => {
    const inPeriod = await pipelineService.board({ wonSince: "2026-07-13" });
    expect(inPeriod.wonSince).toBe("2026-07-13");
    expect(inPeriod.totals).toEqual({ prospect: 1, proposal: 1, won: 1 });
    const later = await pipelineService.board({ wonSince: "2026-09-16" });
    expect(later.totals).toEqual({ prospect: 1, proposal: 1, won: 0 });
  });

  it("takes an empty period for all time", async () => {
    await expect(pipelineService.board({ wonSince: "" })).resolves.toMatchObject({ wonSince: null, totals: { won: 1 } });
  });

  it("refuses a period that is not a real day before anybody is asked", async () => {
    for (const wonSince of ["last quarter", "2026-02-31", "13.7.2026"]) {
      await expect(pipelineService.board({ wonSince }), wonSince).rejects.toMatchObject({
        code: "invalid_argument",
        message: "wonSince must be a real date (YYYY-MM-DD)",
      });
    }
    expect(customerList).not.toHaveBeenCalled();
    expect(quoteFacts).not.toHaveBeenCalled();
    expect(shipmentFacts).not.toHaveBeenCalled();
  });

  it("refuses a stage that is none of the three", async () => {
    await expect(pipelineService.board({ stage: "qualified" as never })).rejects.toMatchObject({
      code: "invalid_argument",
      message: "stage must be prospect, proposal or won",
    });
    expect(customerList).not.toHaveBeenCalled();
  });

  it("shows 100 cards per column unless asked otherwise, at most 500, at least one", async () => {
    customerList.mockResolvedValue({ data: prospects(620) });
    const cards = async (limit?: number) => (await pipelineService.board({ limit })).cards.prospect.length;
    expect(await cards()).toBe(100);
    expect(await cards(250)).toBe(250);
    expect(await cards(5000)).toBe(500);
    expect(await cards(0)).toBe(1);
    expect(await cards(2.9)).toBe(2);
    expect((await pipelineService.board({})).totals.prospect).toBe(620);
  });

  it("fetches more of one column with stage and offset", async () => {
    customerList.mockResolvedValue({ data: [...prospects(130), customer("ittec", "Prospect", "2026-09-01T08:00:00.000Z")] });
    const more = await pipelineService.board({ stage: "prospect", offset: 100 });
    expect(more.cards.prospect).toHaveLength(30);
    expect(more.cards.proposal).toEqual([]);
    expect(more.totals).toEqual({ prospect: 130, proposal: 1, won: 0 });
    // A negative offset is the beginning.
    expect((await pipelineService.board({ stage: "prospect", offset: -5, limit: 3 })).cards.prospect).toHaveLength(3);
  });

  it("fails as a whole when one of the services cannot be asked: no board with a column silently empty", async () => {
    shipmentFacts.mockRejectedValue(new Error("shipments is unreachable"));
    await expect(pipelineService.board({})).rejects.toThrow("shipments is unreachable");
    shipmentFacts.mockResolvedValue({ customers: [], shipmentsWithoutCustomer: 0 });
    quoteFacts.mockRejectedValue(new Error("quotes is unreachable"));
    await expect(pipelineService.board({})).rejects.toThrow("quotes is unreachable");
  });
});
