import { beforeEach, describe, expect, it, vi } from "vitest";

// What the customers owe, for the Sales managers' cockpit and the credit warning on a new quote or shipment.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
const customers = vi.hoisted(() => ({ creditLimitsOf: vi.fn(), getByIdForCompany: vi.fn() }));
vi.mock("../../repositories/customer.repository", () => ({ customerRepository: customers }));
const invoices = vi.hoisted(() => ({ owedEntriesOf: vi.fn(), findByCustomer: vi.fn() }));
vi.mock("../../repositories/customerInvoice.repository", () => ({ customerInvoiceRepository: invoices }));
vi.mock("../../../../lib/businessDate", () => ({ businessDay: () => "2026-11-18" }));
// The work not yet invoiced, asked of Invoicing.
const invoicing = vi.hoisted(() => ({ _internalUnbilledOfCustomer: vi.fn(), _internalCustomerOwed: vi.fn() }));
vi.mock("~encore/clients", () => ({ invoicing }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: logger }));

import { creditFactsService } from "../../services/creditFacts.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const A = "0b6a1c1e-1111-4a4a-8a8a-000000000001";
const owed = (over: Record<string, unknown> = {}) => ({ customerId: A, currency: "EUR", amount: 1000, leftToPay: null, status: "Open", dueDate: "2026-12-01", ...over });

beforeEach(() => {
  vi.resetAllMocks();
  customers.creditLimitsOf.mockResolvedValue([{ id: A, creditLimit: 5000, currency: "EUR" }]);
  customers.getByIdForCompany.mockResolvedValue({ id: A, companyName: "Alfa s.r.o.", creditLimit: 5000, currency: "EUR", paymentTerms: "Prepayment" });
  invoicing._internalUnbilledOfCustomer.mockResolvedValue({ amounts: [], jobs: 0, capped: false });
  // Unless a test says otherwise, Invoicing can't be asked what is owed: the warning counts the customer's list (as
  // before the mock test council), which the tests below of that rule read.
  invoicing._internalCustomerOwed.mockRejectedValue(new Error("invoicing is down"));
  invoices.findByCustomer.mockResolvedValue([]);
});

describe("the credit warning from Invoicing's own figures (m5)", () => {
  const typed = (over: Record<string, unknown> = {}) => ({ source: "typed", currency: "EUR", amount: 300, leftToPay: null, status: "Open", dueDate: "2026-10-15", ...over });

  it("counts what Invoicing says is owed - an invoice missing from the customer's list too - plus the rows typed by hand", async () => {
    // The customer's list lost one invoice's hand-over: its copy says nothing is owed.
    invoices.owedEntriesOf.mockResolvedValue([]);
    invoicing._internalCustomerOwed.mockResolvedValue({ unpaid: [{ currency: "EUR", amount: 1210 }, { currency: "CZK", amount: 5000 }], overdueCount: 1, oldestOverdueDue: "2026-11-01" });
    invoices.findByCustomer.mockResolvedValue([
      typed(),
      typed({ currency: "CZK", amount: 1000, status: "Paid" }),
      // A row Invoicing posted is Invoicing's: never counted twice.
      { ...typed({ amount: 1210, dueDate: "2026-11-01" }), source: "invoicing" },
    ]);
    await expect(creditFactsService.warningOf(COMPANY, A)).resolves.toMatchObject({
      unpaid: [{ currency: "CZK", amount: 5000 }, { currency: "EUR", amount: 1510 }],
      overdueCount: 2,
      oldestOverdueDue: "2026-10-15",
    });
    expect(invoicing._internalCustomerOwed).toHaveBeenCalledWith({ customerId: A });
    expect(invoices.findByCustomer).toHaveBeenCalledWith(A, COMPANY);
    expect(invoices.owedEntriesOf).not.toHaveBeenCalled();
  });

  it("counts the customer's list when Invoicing's answer can't be read", async () => {
    invoices.owedEntriesOf.mockResolvedValue([owed({ dueDate: "2026-11-01" })]);
    for (const answer of [undefined, { unpaid: "x", overdueCount: 0 }, { unpaid: [{ currency: "EUR", amount: "1" }], overdueCount: 0 }, { unpaid: [], overdueCount: "1" }]) {
      invoicing._internalCustomerOwed.mockResolvedValueOnce(answer);
      await expect(creditFactsService.warningOf(COMPANY, A)).resolves.toMatchObject({ unpaid: [{ currency: "EUR", amount: 1000 }], overdueCount: 1 });
    }
  });
});

describe("the credit warning", () => {
  it("gives the limit, the terms (prepayment told apart) and what is owed and overdue per currency, netted", async () => {
    invoices.owedEntriesOf.mockResolvedValue([
      owed({ amount: 1000, leftToPay: 500, dueDate: "2026-11-01" }),
      owed({ amount: -200, leftToPay: 0, dueDate: "2026-11-01" }),
      owed({ currency: "CZK", amount: 12000, dueDate: "2026-11-30" }),
    ]);
    invoicing._internalUnbilledOfCustomer.mockResolvedValue({ amounts: [{ currency: "EUR", amount: 1250.5 }, { currency: "USD", amount: 300 }], jobs: 2, capped: false });
    await expect(creditFactsService.warningOf(COMPANY, A)).resolves.toEqual({
      customerId: A,
      companyName: "Alfa s.r.o.",
      creditLimit: 5000,
      currency: "EUR",
      paymentTerms: "Prepayment",
      prepayment: true,
      unpaid: [{ currency: "EUR", amount: 500 }, { currency: "CZK", amount: 12000 }],
      overdueCount: 1,
      oldestOverdueDue: "2026-11-01",
      unbilled: [{ currency: "EUR", amount: 1250.5 }, { currency: "USD", amount: 300 }],
      unbilledJobs: 2,
      unbilledKnown: true,
    });
    expect(customers.getByIdForCompany).toHaveBeenCalledWith(A, COMPANY);
    expect(invoicing._internalUnbilledOfCustomer).toHaveBeenCalledWith({ customerId: A });
  });

  it("still answers when Invoicing can't be asked for the work not yet invoiced, saying it is not known", async () => {
    invoices.owedEntriesOf.mockResolvedValue([owed({ dueDate: "2026-11-01" })]);
    invoicing._internalUnbilledOfCustomer.mockRejectedValue(new Error("invoicing is down"));
    await expect(creditFactsService.warningOf(COMPANY, A)).resolves.toEqual({
      customerId: A,
      companyName: "Alfa s.r.o.",
      creditLimit: 5000,
      currency: "EUR",
      paymentTerms: "Prepayment",
      prepayment: true,
      unpaid: [{ currency: "EUR", amount: 1000 }],
      overdueCount: 1,
      oldestOverdueDue: "2026-11-01",
      unbilled: [],
      unbilledJobs: 0,
      unbilledKnown: false,
    });
    expect(logger.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("the work not yet invoiced could not be read"), { customerId: A });
  });

  it("takes an answer it can't read for one that is not known", async () => {
    invoices.owedEntriesOf.mockResolvedValue([]);
    for (const answer of [undefined, {}, { amounts: [{ currency: "EUR", amount: "12" }], jobs: 1 }, { amounts: [{ amount: 5 }], jobs: 1 }]) {
      invoicing._internalUnbilledOfCustomer.mockResolvedValueOnce(answer);
      await expect(creditFactsService.warningOf(COMPANY, A)).resolves.toMatchObject({ unbilled: [], unbilledJobs: 0, unbilledKnown: false, creditLimit: 5000 });
    }
  });

  it("knows a customer with no work waiting for an invoice, and leaves out currencies with nothing", async () => {
    invoices.owedEntriesOf.mockResolvedValue([]);
    invoicing._internalUnbilledOfCustomer.mockResolvedValue({ amounts: [{ currency: "EUR", amount: 0 }], jobs: 0, capped: false });
    await expect(creditFactsService.warningOf(COMPANY, A)).resolves.toMatchObject({ unbilled: [], unbilledJobs: 0, unbilledKnown: true });
  });

  it("says nothing is owed for a customer without unpaid invoices", async () => {
    invoices.owedEntriesOf.mockResolvedValue([]);
    await expect(creditFactsService.warningOf(COMPANY, A)).resolves.toMatchObject({ unpaid: [], overdueCount: 0, oldestOverdueDue: null });
  });

  it("is not found for a customer that is not live in the company, or an id that is no id", async () => {
    customers.getByIdForCompany.mockResolvedValue(null);
    await expect(creditFactsService.warningOf(COMPANY, A)).rejects.toMatchObject({ code: "not_found" });
    await expect(creditFactsService.warningOf(COMPANY, "nope")).rejects.toMatchObject({ code: "not_found" });
    expect(customers.getByIdForCompany).toHaveBeenCalledTimes(1);
    expect(invoicing._internalUnbilledOfCustomer).not.toHaveBeenCalled();
  });
});

describe("the cockpit's credit facts", () => {
  it("net a partial credit note into its invoice and never count its minus entry as overdue", async () => {
    invoices.owedEntriesOf.mockResolvedValue([owed({ dueDate: "2026-11-01" }), owed({ amount: -300, dueDate: "2026-11-01" })]);
    await expect(creditFactsService.factsOf(COMPANY, [A, "nope"])).resolves.toEqual([
      { customerId: A, creditLimit: 5000, currency: "EUR", unpaid: [{ currency: "EUR", amount: 700 }], overdueCount: 1, oldestOverdueDue: "2026-11-01" },
    ]);
    expect(invoices.owedEntriesOf).toHaveBeenCalledWith(COMPANY, [A]);
    expect(invoicing._internalUnbilledOfCustomer).not.toHaveBeenCalled();
  });
});
