import { beforeEach, describe, expect, it, vi } from "vitest";

const lines = vi.hoisted(() => ({
  listLines: vi.fn(),
  createForCompany: vi.fn(),
  updateLine: vi.fn(),
  softDeleteLine: vi.fn(),
}));
const invoices = vi.hoisted(() => ({ getInvoice: vi.fn(), upsertInvoice: vi.fn() }));
vi.mock("../repositories/customsInvoice.repository", () => ({
  customsInvoiceLineRepository: lines,
  customsInvoiceRepository: invoices,
}));
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({
  APIError: { notFound: (msg: string) => new Error(msg), invalidArgument: (msg: string) => new Error(msg) },
}));

import { customsInvoicingService } from "../services/customsInvoicing.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const SHIPMENT = "00000000-0000-0000-0000-0000000000aa";
const row = (over: Record<string, unknown> = {}) => ({
  id: "l1", shipmentId: SHIPMENT, category: "Duty", currency: "CZK", value: "100.00", sortOrder: 0,
  companyId: COMPANY, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("customsInvoicingService", () => {
  it("returns the lines and a blank number when none was issued", async () => {
    lines.listLines.mockResolvedValue([row()]);
    invoices.getInvoice.mockResolvedValue(null);
    expect(await customsInvoicingService.get(SHIPMENT, COMPANY)).toEqual({
      lines: [{ id: "l1", shipmentId: SHIPMENT, category: "Duty", currency: "CZK", value: "100.00", sortOrder: 0 }],
      issuedInvoiceNumber: "",
    });
  });

  it("writes only the fields sent, a cleared value as null", async () => {
    lines.updateLine.mockResolvedValue(row({ value: null }));
    await customsInvoicingService.updateLine(SHIPMENT, "l1", COMPANY, { value: "  " });
    expect(lines.updateLine).toHaveBeenCalledWith("l1", COMPANY, SHIPMENT, { value: null });
  });

  it("normalises category and currency", async () => {
    lines.createForCompany.mockResolvedValue(row());
    await customsInvoicingService.addLine(SHIPMENT, COMPANY, { category: " Duty ", currency: "eur", value: "12.5" });
    expect(lines.createForCompany).toHaveBeenCalledWith(COMPANY, {
      shipmentId: SHIPMENT, category: "Duty", currency: "EUR", value: "12.5",
    });
  });

  it("refuses a value that is not an amount instead of letting Postgres fail", async () => {
    await expect(customsInvoicingService.updateLine(SHIPMENT, "l1", COMPANY, { value: "1.000.50" })).rejects.toThrow(
      "is not an amount",
    );
    expect(lines.updateLine).not.toHaveBeenCalled();
  });

  it("reports a line of another shipment or company as not found", async () => {
    lines.updateLine.mockResolvedValue(null);
    lines.softDeleteLine.mockResolvedValue(null);
    await expect(customsInvoicingService.updateLine(SHIPMENT, "x", COMPANY, { category: "VAT" })).rejects.toThrow("Line not found");
    await expect(customsInvoicingService.deleteLine(SHIPMENT, "x", COMPANY)).rejects.toThrow("Line not found");
  });

  it("trims the issued invoice number", async () => {
    invoices.upsertInvoice.mockResolvedValue({ issuedInvoiceNumber: "FV-1" });
    expect(await customsInvoicingService.setIssuedInvoiceNumber(SHIPMENT, COMPANY, " FV-1 ")).toBe("FV-1");
    expect(invoices.upsertInvoice).toHaveBeenCalledWith(SHIPMENT, COMPANY, "FV-1");
  });
});
