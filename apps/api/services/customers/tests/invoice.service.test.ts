import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("../db/db", () => ({ db: {} }));
const repo = vi.hoisted(() => ({ upsertIssued: vi.fn() }));
vi.mock("../repositories/customerInvoice.repository", () => ({ customerInvoiceRepository: repo }));
const customers = vi.hoisted(() => ({ requireLive: vi.fn() }));
vi.mock("../services/customer.service", () => ({ customerService: customers }));

import { invoiceService } from "../services/invoice.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const CUSTOMER = "00000000-0000-0000-0000-0000000000cc";
const issued = { invoiceNumber: "INV2026CZ00000028-001", amount: 29999.5, currency: "czk", dueDate: "2026-11-25", status: "Open" as const, issuedAt: "2026-11-11" };

beforeEach(() => {
  vi.clearAllMocks();
  customers.requireLive.mockResolvedValue({ id: CUSTOMER, currency: "EUR" });
  repo.upsertIssued.mockImplementation(async (_c: string, v: Record<string, unknown>) => ({ id: "ci1", createdAt: new Date(), updatedAt: new Date(), deletedAt: null, companyId: COMPANY, ...v }));
});

describe("an invoice Invoicing issued, in the customer's list", () => {
  it("is written by its number (an outbox delivery sent again updates the same entry), in the invoice's own currency", async () => {
    await invoiceService.postIssued(COMPANY, CUSTOMER, issued);
    expect(repo.upsertIssued).toHaveBeenCalledWith(COMPANY, {
      customerId: CUSTOMER,
      invoiceNumber: "INV2026CZ00000028-001",
      amount: 29999.5,
      currency: "CZK",
      dueDate: "2026-11-25",
      status: "Open",
      issuedAt: "2026-11-11",
    });
  });

  it("is refused for a customer that is gone", async () => {
    customers.requireLive.mockRejectedValue(new Error("Customer not found"));
    await expect(invoiceService.postIssued(COMPANY, CUSTOMER, issued)).rejects.toThrow("Customer not found");
    expect(repo.upsertIssued).not.toHaveBeenCalled();
  });
});
