import { beforeEach, describe, expect, it, vi } from "vitest";

// The import of a quote's costs is run for real - with the mapping of its lines - against a
// stand-in for the quotes service and for the repository that writes the rows.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ quotes: { salesQuoteGet: vi.fn() }, shipments: { shipmentGet: vi.fn() }, customers: { customerGet: vi.fn(), _internalCompaniesWithRole: vi.fn() } }));
vi.mock("../../repositories/customsInvoice.repository", () => ({ customsInvoiceLineRepository: {}, customsInvoiceRepository: {} }));
vi.mock("../../../../lib/shipmentRefs", () => ({ assertShipmentExists: vi.fn(async () => ({ jobNumber: "CZ00000001" })) }));
vi.mock("../../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: {} }));
vi.mock("../../repositories/additionalCharge.repository", () => ({ additionalChargeRepository: {} }));
vi.mock("../../repositories/billingSettings.repository", () => ({ billingSettingsRepository: {} }));
vi.mock("../../repositories/billingOverride.repository", () => ({ billingOverrideRepository: {} }));
vi.mock("../../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: {} }));
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: { listByShipment: vi.fn() } }));
vi.mock("../../repositories/sellingCost.repository", () => ({ sellingCostRepository: {} }));
vi.mock("../../repositories/quoteCostImport.repository", () => ({ quoteCostImportRepository: { copy: vi.fn() } }));
vi.mock("../../repositories/truckingLines.repository", () => ({ truckingLinesRepository: { hasConsignmentRows: vi.fn() } }));

import log from "encore.dev/log";
import { customers, quotes, shipments } from "~encore/clients";
import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { additionalChargeRepository } from "../../repositories/additionalCharge.repository";
import { billingOverrideRepository } from "../../repositories/billingOverride.repository";
import { billingSettingsRepository } from "../../repositories/billingSettings.repository";
import { generatedInvoiceRepository } from "../../repositories/generatedInvoice.repository";
import { invoiceCostRepository } from "../../repositories/invoiceCost.repository";
import { invoiceRepository } from "../../repositories/invoice.repository";
import { quoteCostImportRepository } from "../../repositories/quoteCostImport.repository";
import { sellingCostRepository } from "../../repositories/sellingCost.repository";
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
  { category: "ocean_freight", description: "", vendor: "Maersk", supplierCustomerId: null, estQty: "1", estAmount: "2000.00", estCurrency: "USD", realQty: "1", realCurrency: "USD", unit: "" },
  { category: "thc_destination", description: "", vendor: "", supplierCustomerId: null, estQty: "1", estAmount: "3500.00", estCurrency: "CZK", realQty: "1", realCurrency: "CZK", unit: "" },
];
const SELLING = [{ category: "ocean_freight", description: "All-in", customer: "ITTEC s.r.o.", qty: "1", amount: "2400.00", currency: "USD", invoice: true }];

beforeEach(() => {
  vi.resetAllMocks();
  salesQuoteGet.mockResolvedValue({ quote: { quoteNumber: REF, effectiveStatus: "won", data: DATA } } as Awaited<ReturnType<typeof quotes.salesQuoteGet>>);
  copy.mockImplementation(async (_companyId, _shipmentId, _quoteNumber, rows) => ({ buying: rows.buying?.length ?? 0, selling: rows.selling?.length ?? 0 }));
  // A shipment billed before: its billing settings are there, so the copy leaves its currency be.
  Object.assign(billingSettingsRepository, { getByShipmentId: vi.fn(async () => ({ shipmentId: SHIPMENT, billingCurrency: "CZK" })) });
  vi.mocked(invoiceRepository.listByShipment).mockResolvedValue([]);
});

describe("importQuote", () => {
  it("copies the lines of the stored quote - asked for by its whole reference - one row per line, to both sides", async () => {
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", false)).resolves.toEqual({ buying: 2, selling: 1 });
    // The variant suffix is part of the reference: -2 is another quote than the base.
    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: REF });
    expect(copy).toHaveBeenCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: SELLING }, false, undefined);
  });

  it("leaves the other side untouched when one side is asked for", async () => {
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "buy", false)).resolves.toEqual({ buying: 2, selling: 0 });
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: undefined }, false, undefined);
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "sell", false)).resolves.toEqual({ buying: 0, selling: 1 });
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: undefined, selling: SELLING }, false, undefined);
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
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: SELLING }, true, undefined);
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
    expect(copy).toHaveBeenCalledWith(COMPANY, SHIPMENT, REF, { buying: [], selling: [] }, false, undefined);
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
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: SELLING }, false, undefined);
    // Without a consignment the trucking lines are copied as any other.
    vi.mocked(truckingLinesRepository.hasConsignmentRows).mockResolvedValueOnce(false);
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", true)).resolves.toEqual({ buying: 3, selling: 2 });
  });

  it("keeps a quote line's supplier link only when it names a live supplier of this company (C-7)", async () => {
    const MAERSK = "3d55a500-d6f8-4def-8e95-82e77493cabb";
    const GONE = "3d55a500-d6f8-4def-8e95-82e77493ca00";
    const linked = {
      ...DATA,
      buyingLines: [
        { ...DATA.buyingLines[0], supplierCustomerId: MAERSK.toUpperCase() },
        { ...DATA.buyingLines[0], supplier: "Old Line", supplierCustomerId: GONE },
      ],
    };
    salesQuoteGet.mockResolvedValue({ quote: { quoteNumber: REF, effectiveStatus: "won", data: linked } } as Awaited<ReturnType<typeof quotes.salesQuoteGet>>);
    const withRole = vi.mocked(customers._internalCompaniesWithRole);
    withRole.mockImplementation((async ({ role }: { role: string }) => ({ companies: role === "shipping_line" ? [{ id: MAERSK }] : [] })) as never);
    await invoicingService.importQuote(SHIPMENT, COMPANY, REF, "buy", false);
    // Asked once per supplier role, for all the ids at once.
    expect(withRole).toHaveBeenCalledTimes(5);
    expect(withRole).toHaveBeenCalledWith({ role: "shipping_line", ids: [MAERSK, GONE] });
    const buying = copy.mock.calls[0]![3].buying!;
    expect(buying.map((r) => [r.vendor, r.supplierCustomerId])).toEqual([
      ["Maersk", MAERSK],
      ["Old Line", null],
    ]);
  });

  it("asks the Customer Database nothing when no quote line is linked", async () => {
    await invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", false);
    expect(customers._internalCompaniesWithRole).not.toHaveBeenCalled();
  });

  it("starts a shipment's first billing settings in its customer's default currency, while nothing was invoiced", async () => {
    vi.mocked(billingSettingsRepository.getByShipmentId).mockResolvedValue(null);
    vi.mocked(shipments.shipmentGet).mockResolvedValue({ shipment: { id: SHIPMENT, customerId: "c1" } } as Awaited<ReturnType<typeof shipments.shipmentGet>>);
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { id: "c1", currency: "EUR" } } as Awaited<ReturnType<typeof customers.customerGet>>);
    await invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", false);
    expect(customers.customerGet).toHaveBeenCalledWith({ id: "c1" });
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: SELLING }, false, "EUR");
    // Once an invoice was issued the currency is left as it was billed.
    vi.mocked(invoiceRepository.listByShipment).mockResolvedValue([{ id: "i1" }] as Awaited<ReturnType<typeof invoiceRepository.listByShipment>>);
    await invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", true);
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: SELLING }, true, undefined);
  });

  it("copies all the same when the customer's currency can't be read, billing in CZK as before", async () => {
    vi.mocked(billingSettingsRepository.getByShipmentId).mockResolvedValue(null);
    vi.mocked(shipments.shipmentGet).mockRejectedValue(new Error("shipments is unreachable"));
    await expect(invoicingService.importQuote(SHIPMENT, COMPANY, REF, "both", false)).resolves.toEqual({ buying: 2, selling: 1 });
    expect(copy).toHaveBeenLastCalledWith(COMPANY, SHIPMENT, REF, { buying: BUYING, selling: SELLING }, false, undefined);
    expect(log.warn).toHaveBeenCalled();
  });
});

describe("startBilling", () => {
  beforeEach(() => {
    Object.assign(billingSettingsRepository, { getByShipmentId: vi.fn(async () => null), createIfMissing: vi.fn() });
    vi.mocked(shipments.shipmentGet).mockResolvedValue({ shipment: { id: SHIPMENT, customerId: "c1" } } as Awaited<ReturnType<typeof shipments.shipmentGet>>);
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { id: "c1", currency: "EUR" } } as Awaited<ReturnType<typeof customers.customerGet>>);
  });

  it("makes a shipment's first billing settings in its customer's default currency", async () => {
    await invoicingService.startBilling(COMPANY, SHIPMENT);
    expect(billingSettingsRepository.createIfMissing).toHaveBeenCalledWith(SHIPMENT, COMPANY, { billingCurrency: "EUR" });
  });

  it("leaves a shipment with billing settings, or with an invoice, as it is", async () => {
    vi.mocked(billingSettingsRepository.getByShipmentId).mockResolvedValueOnce({ shipmentId: SHIPMENT, billingCurrency: "USD" } as never);
    await invoicingService.startBilling(COMPANY, SHIPMENT);
    vi.mocked(invoiceRepository.listByShipment).mockResolvedValueOnce([{ id: "i1" }] as never);
    await invoicingService.startBilling(COMPANY, SHIPMENT);
    expect(billingSettingsRepository.createIfMissing).not.toHaveBeenCalled();
  });

  it("makes nothing without a customer", async () => {
    vi.mocked(shipments.shipmentGet).mockResolvedValue({ shipment: { id: SHIPMENT, customerId: null } } as Awaited<ReturnType<typeof shipments.shipmentGet>>);
    await invoicingService.startBilling(COMPANY, SHIPMENT);
    expect(billingSettingsRepository.createIfMissing).not.toHaveBeenCalled();
  });
});

describe("getInvoicingData", () => {
  // A shipment without cost rows whose billing settings remember the quote its costs came from.
  const settingsWith = (quoteRef: string) =>
    Object.assign(billingSettingsRepository, {
      getByShipmentId: vi.fn(async () => ({ id: "settings-1", shipmentId: SHIPMENT, billingCurrency: "CZK", roe: "1", quoteRef })),
    });

  beforeEach(() => {
    const none = { listByShipmentId: vi.fn(async () => []) };
    for (const repository of [invoiceCostRepository, sellingCostRepository, additionalChargeRepository, billingOverrideRepository, generatedInvoiceRepository]) {
      Object.assign(repository, none);
    }
  });

  it("brings the quote the costs were copied from: its validity and who owns it", async () => {
    settingsWith(REF);
    salesQuoteGet.mockResolvedValueOnce({ quote: { quoteNumber: REF, validUntil: "2026-11-30", ownerName: "Jana Nováková" } } as Awaited<ReturnType<typeof quotes.salesQuoteGet>>);
    const data = await invoicingService.getInvoicingData(SHIPMENT, COMPANY);
    expect(data.costsQuote).toEqual({ quoteNumber: REF, validUntil: "2026-11-30", ownerName: "Jana Nováková" });
    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: REF });
  });

  it("asks nothing for a reference that names no sales quote", async () => {
    settingsWith("ACME-PO-17");
    await expect(invoicingService.getInvoicingData(SHIPMENT, COMPANY)).resolves.toMatchObject({ costsQuote: null });
    expect(salesQuoteGet).not.toHaveBeenCalled();
  });

  it("loads the costs all the same when the quote is gone or cannot be read", async () => {
    settingsWith(REF);
    salesQuoteGet.mockRejectedValueOnce(APIError.notFound("Quote not found"));
    await expect(invoicingService.getInvoicingData(SHIPMENT, COMPANY)).resolves.toMatchObject({ costsQuote: null, costs: [] });
    expect(log.warn).not.toHaveBeenCalled();
    salesQuoteGet.mockRejectedValueOnce(new Error("quotes is down"));
    await expect(invoicingService.getInvoicingData(SHIPMENT, COMPANY)).resolves.toMatchObject({ costsQuote: null });
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});
