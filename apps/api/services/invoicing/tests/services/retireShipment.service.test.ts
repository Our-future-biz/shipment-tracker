import { beforeEach, describe, expect, it, vi } from "vitest";

// A deleted shipment's rows retired (the shipment-deleted subscription → invoicingService.retireShipment), against
// stand-ins for the repositories and Accounts Payable: what is asked in which order, and what the log is told.
const ap = vi.hoisted(() => ({ beforeLineChange: vi.fn(), afterLineWrite: vi.fn(), beforeShipmentRetired: vi.fn() }));
vi.mock("../../services/supplierInvoice.service", () => ({ supplierInvoiceService: ap }));
vi.mock("../../repositories/supplierInvoice.repository", () => ({ supplierInvoiceRepository: {} }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ quotes: {}, shipments: {}, customers: {} }));
vi.mock("../../../../lib/shipmentRefs", () => ({ assertShipmentExists: vi.fn() }));
const repos = vi.hoisted(() => ({
  cost: { softDeleteForShipment: vi.fn(async (): Promise<number> => 0) },
  selling: { softDeleteForShipment: vi.fn(async () => undefined) },
  charge: { softDeleteForShipment: vi.fn(async () => undefined) },
  settings: { softDeleteForShipment: vi.fn(async () => undefined) },
  override: { softDeleteForShipment: vi.fn(async () => undefined) },
  customsLine: { softDeleteForShipment: vi.fn(async () => undefined) },
  customs: { softDeleteForShipment: vi.fn(async () => undefined) },
}));
vi.mock("../../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: repos.cost }));
vi.mock("../../repositories/sellingCost.repository", () => ({ sellingCostRepository: repos.selling }));
vi.mock("../../repositories/additionalCharge.repository", () => ({ additionalChargeRepository: repos.charge }));
vi.mock("../../repositories/billingSettings.repository", () => ({ billingSettingsRepository: repos.settings }));
vi.mock("../../repositories/billingOverride.repository", () => ({ billingOverrideRepository: repos.override }));
vi.mock("../../repositories/customsInvoice.repository", () => ({ customsInvoiceLineRepository: repos.customsLine, customsInvoiceRepository: repos.customs }));
vi.mock("../../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: {} }));
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: {} }));
vi.mock("../../repositories/quoteCostImport.repository", () => ({ quoteCostImportRepository: {} }));
vi.mock("../../repositories/truckingLines.repository", () => ({ truckingLinesRepository: {} }));

import log from "encore.dev/log";
import { invoicingService } from "../../services/invoicing.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";

beforeEach(() => {
  vi.clearAllMocks();
  repos.cost.softDeleteForShipment.mockResolvedValue(0);
  ap.afterLineWrite.mockResolvedValue([]);
});

describe("retiring a deleted shipment", () => {
  it("sends its approved supplier invoices back before its lines go, and matches the lines again after", async () => {
    await invoicingService.retireShipment(SHIPMENT, COMPANY);
    const before = ap.beforeShipmentRetired.mock.invocationCallOrder[0]!;
    const deletes = Object.values(repos).map((r) => r.softDeleteForShipment.mock.invocationCallOrder[0]!);
    const after = ap.afterLineWrite.mock.invocationCallOrder[0]!;
    expect(ap.beforeShipmentRetired).toHaveBeenCalledWith(COMPANY, SHIPMENT);
    for (const d of deletes) {
      expect(before).toBeLessThan(d);
      expect(d).toBeLessThan(after);
    }
    expect(ap.afterLineWrite).toHaveBeenCalledWith({ companyID: COMPANY, userID: "" }, { shipmentIds: [SHIPMENT] }, "typed");
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("says in the log when lines stayed on a supplier invoice marked paid", async () => {
    repos.cost.softDeleteForShipment.mockResolvedValue(2);
    await invoicingService.retireShipment(SHIPMENT, COMPANY);
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/marked paid/), { companyId: COMPANY, shipmentId: SHIPMENT, lines: 2 });
  });

  it("deletes nothing when Accounts Payable could not send an approved invoice back, so a redelivery tries it all again", async () => {
    ap.beforeShipmentRetired.mockRejectedValue(new Error("changed meanwhile"));
    await expect(invoicingService.retireShipment(SHIPMENT, COMPANY)).rejects.toThrow("changed meanwhile");
    for (const r of Object.values(repos)) expect(r.softDeleteForShipment).not.toHaveBeenCalled();
  });
});
