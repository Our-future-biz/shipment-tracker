import { beforeEach, describe, expect, it, vi } from "vitest";

const invoices = vi.hoisted(() => ({ getNextInvoiceNumber: vi.fn(), createForCompany: vi.fn() }));
const refs = vi.hoisted(() => ({ assertShipmentExists: vi.fn() }));

vi.mock("encore.dev/api", () => ({ APIError: { invalidArgument: (m: string) => new Error(m), notFound: (m: string) => new Error(m) } }));
vi.mock("../../../lib/shipmentRefs", () => refs);
vi.mock("../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: invoices }));
vi.mock("../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: {} }));
vi.mock("../repositories/additionalCharge.repository", () => ({ additionalChargeRepository: {} }));
vi.mock("../repositories/billingSettings.repository", () => ({ billingSettingsRepository: {} }));
vi.mock("../repositories/billingOverride.repository", () => ({ billingOverrideRepository: {} }));
vi.mock("../repositories/sellingCost.repository", () => ({ sellingCostRepository: {} }));
vi.mock("../repositories/customsInvoice.repository", () => ({ customsInvoiceLineRepository: {}, customsInvoiceRepository: {} }));

import { invoicingService } from "../services/invoicing.service";
import { isUniqueViolation } from "../../../lib/db/errors";

const SHIPMENT = "00000000-0000-0000-0000-0000000000aa";
const row = (invoiceNumber: string) => ({
  id: "i1", shipmentId: SHIPMENT, invoiceNumber, invoiceType: "total", billingCurrency: "EUR", totalAmount: "10.00",
  companyId: "c1", createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
});
// What drizzle throws for a unique violation: the driver's error as its cause.
const duplicate = () => Object.assign(new Error("Failed query"), { cause: { code: "23505" } });

beforeEach(() => {
  vi.clearAllMocks();
  refs.assertShipmentExists.mockResolvedValue({ jobNumber: "JCZ0042" });
});

describe("isUniqueViolation", () => {
  it("reads the code from drizzle's wrapped error and from the bare driver error", () => {
    expect(isUniqueViolation(duplicate())).toBe(true);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23503" } })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("invoicingService.generateInvoice", () => {
  it("numbers the invoice after the shipment's own job number", async () => {
    invoices.getNextInvoiceNumber.mockResolvedValue("JCZ0042-001");
    invoices.createForCompany.mockResolvedValue(row("JCZ0042-001"));
    const invoice = await invoicingService.generateInvoice(SHIPMENT, "c1", "total", "EUR", "10");
    expect(invoices.getNextInvoiceNumber).toHaveBeenCalledWith("JCZ0042", SHIPMENT, "c1");
    expect(invoice.invoiceNumber).toBe("JCZ0042-001");
  });

  it("takes the next number when another invoice got this one first", async () => {
    invoices.getNextInvoiceNumber.mockResolvedValueOnce("JCZ0042-001").mockResolvedValueOnce("JCZ0042-002");
    invoices.createForCompany.mockRejectedValueOnce(duplicate()).mockResolvedValueOnce(row("JCZ0042-002"));
    const invoice = await invoicingService.generateInvoice(SHIPMENT, "c1", "total", "EUR", "10");
    expect(invoice.invoiceNumber).toBe("JCZ0042-002");
    expect(invoices.createForCompany).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    invoices.getNextInvoiceNumber.mockResolvedValue("JCZ0042-001");
    invoices.createForCompany.mockRejectedValue(new Error("boom"));
    await expect(invoicingService.generateInvoice(SHIPMENT, "c1", "total", "EUR", "10")).rejects.toThrow("boom");
    expect(invoices.createForCompany).toHaveBeenCalledTimes(1);
  });
});
