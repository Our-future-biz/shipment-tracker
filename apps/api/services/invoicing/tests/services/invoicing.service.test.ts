import { beforeEach, describe, expect, it, vi } from "vitest";

// The import of a quote's costs is run for real - with the mapping of its lines - against a
// stand-in for the quotes service and for the repository that writes the rows.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ quotes: { salesQuoteGet: vi.fn() } }));
vi.mock("../../repositories/customsInvoice.repository", () => ({ customsInvoiceLineRepository: {}, customsInvoiceRepository: {} }));
vi.mock("../../../../lib/shipmentRefs", () => ({ assertShipmentExists: vi.fn(async () => ({ jobNumber: "CZ00000001" })) }));
vi.mock("../../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: {} }));
vi.mock("../../repositories/additionalCharge.repository", () => ({ additionalChargeRepository: {} }));
vi.mock("../../repositories/billingSettings.repository", () => ({ billingSettingsRepository: {} }));
vi.mock("../../repositories/billingOverride.repository", () => ({ billingOverrideRepository: {} }));
vi.mock("../../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: {} }));
vi.mock("../../repositories/sellingCost.repository", () => ({ sellingCostRepository: {} }));
vi.mock("../../repositories/quoteCostImport.repository", () => ({ quoteCostImportRepository: { copy: vi.fn() } }));
vi.mock("../../repositories/truckingLines.repository", () => ({ truckingLinesRepository: { hasConsignmentRows: vi.fn() } }));

import { quotes } from "~encore/clients";
import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { quoteCostImportRepository } from "../../repositories/quoteCostImport.repository";
import { truckingLinesRepository } from "../../repositories/truckingLines.repository";
import { invoicingService } from "../../services/invoicing.service";

const salesQuoteGet = vi.mocked(quotes.salesQuoteGet);
const copy = vi.mocked(quoteCostImportRepository.copy);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const REF = "QCZ20261010001-2";

const DATA = {
  customerName: "ITTEC s.r.o.",
  currency: "USD",
  buyingLines: [
    { type: "Ocean freight", description: "", supplier: "Maersk", currency: "USD", amount: 2000 },
    { type: "THC Destination", description: "", supplier: "", currency: "CZK", amount: 3500 },
  ],
  sellingLines: [{ type: "Ocean freight", description: "All-in", currency: "USD", amount: 2400 }],
};
const BUYING = [
  { category: "ocean_freight", description: "", vendor: "Maersk", estQty: "1", estAmount: "2000.00", estCurrency: "USD", realQty: "1", realCurrency: "USD", unit: "" },
  { category: "thc_destination", description: "", vendor: "", estQty: "1", estAmount: "3500.00", estCurrency: "CZK", realQty: "1", realCurrency: "CZK", unit: "" },
];
const SELLING = [{ category: "ocean_freight", description: "All-in", customer: "ITTEC s.r.o.", qty: "1", amount: "2400.00", currency: "USD", invoice: true }];

beforeEach(() => {
  vi.resetAllMocks();
  salesQuoteGet.mockResolvedValue({ quote: { quoteNumber: REF, effectiveStatus: "won", data: DATA } } as Awaited<ReturnType<typeof quotes.salesQuoteGet>>);
  copy.mockImplementation(async (_companyId, _shipmentId, _quoteNumber, rows) => ({ buying: rows.buying?.length ?? 0, selling: rows.selling?.length ?? 0 }));
});

describe("importQuote", () => {
  it("copies the lines of the stored quote - asked for by its whole reference - one row per line, to both sides", async () => {
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", false)).resolves.toEqual({ buying: 2, selling: 1 });
    // The variant suffix is part of the reference: -2 is another quote than the base.
    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: REF });
    expect(copy).toHaveBeenCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: SELLING }, false);
  });

  it("leaves the other side untouched when one side is asked for", async () => {
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "buy", false)).resolves.toEqual({ buying: 2, selling: 0 });
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: undefined }, false);
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "sell", false)).resolves.toEqual({ buying: 0, selling: 1 });
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: undefined, selling: SELLING }, false);
  });

  it("marks the rows with the reference the quote is stored under", async () => {
    salesQuoteGet.mockResolvedValue({ quote: { quoteNumber: "QCZ20261010001", effectiveStatus: "won", data: DATA } } as Awaited<ReturnType<typeof quotes.salesQuoteGet>>);
    await invoicingService.importQuote(SHIPMENT, COMPANY, "QCZ20261010001", "both", false);
    expect(copy.mock.calls[0]![2]).toBe("QCZ20261010001");
  });

  it("refuses a quote whose costs were already copied to that side, in words for the user - unless forced", async () => {
    copy.mockResolvedValueOnce(null);
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", false)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "costs from QCZ20261010001-2 were already copied to this shipment",
      details: { alreadyCopied: true },
    });
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", true)).resolves.toEqual({ buying: 2, selling: 1 });
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: SELLING }, true);
  });

  it("refuses a quote that is not Won, by the status it is shown with, and writes nothing", async () => {
    for (const status of ["draft", "quoted", "expired", "lost"]) {
      salesQuoteGet.mockResolvedValueOnce({ quote: { quoteNumber: REF, effectiveStatus: status, data: DATA } } as Awaited<ReturnType<typeof quotes.salesQuoteGet>>);
      const refused = await invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", true).catch((err: unknown) => err);
      expect(refused).toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/ - the quote is \w+ - only a Won quote's costs can be copied to a shipment$/) });
      // Not the refusal that can be asked to copy again.
      expect((refused as { details?: unknown }).details).toBeUndefined();
    }
    expect(copy).not.toHaveBeenCalled();
  });

  it("answers an unknown reference with a sentence that names it, and writes nothing", async () => {
    salesQuoteGet.mockRejectedValue(APIError.notFound("Quote not found"));
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, "QCZ20269999001", "both", false)).rejects.toMatchObject({
      code: "not_found",
      message: "quote QCZ20269999001 not found",
    });
    expect(copy).not.toHaveBeenCalled();
  });

  it("passes on any other failure of the quotes service as it is", async () => {
    salesQuoteGet.mockRejectedValue(new Error("quotes is unreachable"));
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", false)).rejects.toThrow("quotes is unreachable");
    expect(copy).not.toHaveBeenCalled();
  });

  it("copies nothing from a quote without lines, and still records the quote on the shipment", async () => {
    salesQuoteGet.mockResolvedValue({ quote: { quoteNumber: REF, effectiveStatus: "won", data: { customerName: "ITTEC s.r.o." } } } as Awaited<ReturnType<typeof quotes.salesQuoteGet>>);
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", false)).resolves.toEqual({ buying: 0, selling: 0 });
    expect(copy).toHaveBeenCalledWith(COMPANY, SHIPMENT, REF, { buying: [], selling: [] }, false);
  });

  it("leaves out the quote's trucking lines when the job has a Trucking consignment (its road freight is Trucking's)", async () => {
    const withRoad = {
      ...DATA,
      buyingLines: [...DATA.buyingLines, { type: "Road freight", chargeCode: "road_freight", supplier: "Bravo", currency: "CZK", amount: 9000, tariffRef: "trucking:v1:D1" }],
      sellingLines: [...DATA.sellingLines, { type: "Road freight", chargeCode: "road_freight", currency: "CZK", amount: 12000, tariffRef: "trucking:v1:D1" }],
    };
    salesQuoteGet.mockResolvedValue({ quote: { quoteNumber: REF, effectiveStatus: "won", data: withRoad } } as Awaited<ReturnType<typeof quotes.salesQuoteGet>>);
    vi.mocked(truckingLinesRepository.hasConsignmentRows).mockResolvedValueOnce(true);
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", false)).resolves.toEqual({ buying: 2, selling: 1 });
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: SELLING }, false);
    // Without a consignment the trucking lines are copied as any other.
    vi.mocked(truckingLinesRepository.hasConsignmentRows).mockResolvedValueOnce(false);
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", true)).resolves.toEqual({ buying: 3, selling: 2 });
  });
});
