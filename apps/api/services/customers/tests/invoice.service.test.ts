import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("../db/db", () => ({ db: {} }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: logger }));
const repo = vi.hoisted(() => ({
  upsertIssued: vi.fn(),
  getByIdForCompany: vi.fn(),
  createForCompany: vi.fn(),
  updateTyped: vi.fn(),
  softDeleteTyped: vi.fn(),
  applyReceivable: vi.fn(),
  entriesOfIssued: vi.fn(),
}));
vi.mock("../repositories/customerInvoice.repository", () => ({ customerInvoiceRepository: repo }));
const customers = vi.hoisted(() => ({ requireLive: vi.fn() }));
vi.mock("../services/customer.service", () => ({ customerService: customers }));
// Which of these numbers Invoicing issued (D9: such an entry is never changed here).
const issuedNumbers = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ invoicing: { _internalIssuedInvoiceNumbers: issuedNumbers } }));

import { invoiceService } from "../services/invoice.service";
import { POSTED_INVOICE_REFUSAL } from "../lib/receivable";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const CUSTOMER = "00000000-0000-0000-0000-0000000000cc";
const ENTRY = "00000000-0000-0000-0000-0000000000e1";
const INVOICE = "00000000-0000-0000-0000-0000000000a1";
const issued = { invoiceNumber: "INV2026CZ00000028-001", amount: 29999.5, currency: "czk", dueDate: "2026-11-25", status: "Open" as const, issuedAt: "2026-11-11" };
const manager = { userID: "u1", companyID: COMPANY, role: "manager" };
const user = { userID: "u2", companyID: COMPANY, role: "user" };
const now = new Date("2026-11-18T08:00:00Z");
const entryRow = (over: Record<string, unknown> = {}) => ({
  id: ENTRY, companyId: COMPANY, customerId: CUSTOMER, invoiceNumber: "2026-117", amount: 500, currency: "EUR", dueDate: "2026-12-01",
  status: "Open", issuedAt: "2026-11-01", source: "typed", invoiceId: null, leftToPay: null, paidOn: null, createdAt: now, updatedAt: now, deletedAt: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  customers.requireLive.mockResolvedValue({ id: CUSTOMER, currency: "EUR" });
  repo.upsertIssued.mockImplementation(async (_c: string, v: Record<string, unknown>) => entryRow({ ...v, source: "invoicing" }));
  repo.createForCompany.mockImplementation(async (_c: string, v: Record<string, unknown>) => entryRow(v));
  repo.updateTyped.mockImplementation(async (_id: string, _c: string, v: Record<string, unknown>) => entryRow(v));
  repo.softDeleteTyped.mockResolvedValue(true);
  issuedNumbers.mockResolvedValue({ numbers: [] });
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

  it("carries the issued document's id when the delivery names it, and says it was posted by Invoicing", async () => {
    const item = await invoiceService.postIssued(COMPANY, CUSTOMER, { ...issued, invoiceId: INVOICE.toUpperCase() });
    expect(repo.upsertIssued).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ invoiceId: INVOICE }));
    expect(item.source).toBe("invoicing");
  });

  it("refuses an id that is no id, before anything is written", async () => {
    await expect(invoiceService.postIssued(COMPANY, CUSTOMER, { ...issued, invoiceId: "INV-1" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.upsertIssued).not.toHaveBeenCalled();
  });

  it("is refused for a customer that is gone", async () => {
    customers.requireLive.mockRejectedValue(new Error("Customer not found"));
    await expect(invoiceService.postIssued(COMPANY, CUSTOMER, issued)).rejects.toThrow("Customer not found");
    expect(repo.upsertIssued).not.toHaveBeenCalled();
  });
});

describe("the open doors closed (D9): editing and deleting an entry of the customer's list", () => {
  const change = (actor: typeof manager) => invoiceService.update(ENTRY, actor, { amount: 1 });
  const remove = (actor: typeof manager) => invoiceService.softDelete(ENTRY, actor);

  it("refuses an entry Invoicing posted to everyone, managers and superadmins included, without asking Invoicing", async () => {
    repo.getByIdForCompany.mockResolvedValue(entryRow({ source: "invoicing", invoiceId: INVOICE }));
    for (const role of ["user", "manager", "admin", "superadmin"]) {
      const actor = { ...manager, role };
      await expect(change(actor)).rejects.toMatchObject({ code: "failed_precondition", message: POSTED_INVOICE_REFUSAL });
      await expect(remove(actor)).rejects.toMatchObject({ code: "failed_precondition", message: POSTED_INVOICE_REFUSAL });
    }
    expect(POSTED_INVOICE_REFUSAL).toBe("This invoice was issued in Invoicing: it is changed only by a credit note, and a payment is noted on Finance → Accounts Receivable");
    expect(issuedNumbers).not.toHaveBeenCalled();
    expect(repo.updateTyped).not.toHaveBeenCalled();
    expect(repo.softDeleteTyped).not.toHaveBeenCalled();
  });

  it("refuses a typed entry whose number Invoicing issued, to managers too", async () => {
    repo.getByIdForCompany.mockResolvedValue(entryRow());
    issuedNumbers.mockResolvedValue({ numbers: ["2026-117"] });
    await expect(change(manager)).rejects.toMatchObject({ code: "failed_precondition", message: POSTED_INVOICE_REFUSAL });
    await expect(remove(manager)).rejects.toMatchObject({ code: "failed_precondition", message: POSTED_INVOICE_REFUSAL });
    expect(issuedNumbers).toHaveBeenCalledWith({ numbers: ["2026-117"] });
    expect(repo.updateTyped).not.toHaveBeenCalled();
    expect(repo.softDeleteTyped).not.toHaveBeenCalled();
  });

  it("asks about the new number too when a typed entry is renumbered", async () => {
    repo.getByIdForCompany.mockResolvedValue(entryRow());
    issuedNumbers.mockResolvedValue({ numbers: ["INV2026CZ00000028-001"] });
    await expect(invoiceService.update(ENTRY, manager, { invoiceNumber: "INV2026CZ00000028-001" })).rejects.toMatchObject({ message: POSTED_INVOICE_REFUSAL });
    expect(issuedNumbers).toHaveBeenCalledWith({ numbers: ["2026-117", "INV2026CZ00000028-001"] });
  });

  it("refuses a typed entry to a user", async () => {
    repo.getByIdForCompany.mockResolvedValue(entryRow());
    await expect(change(user)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(remove(user)).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.updateTyped).not.toHaveBeenCalled();
    expect(repo.softDeleteTyped).not.toHaveBeenCalled();
  });

  it("lets a manager change or delete a typed entry Invoicing did not issue - only while it is still a typed one", async () => {
    repo.getByIdForCompany.mockResolvedValue(entryRow());
    await expect(invoiceService.update(ENTRY, manager, { status: "Paid", dueDate: "" })).resolves.toMatchObject({ status: "Paid", source: "typed" });
    expect(repo.updateTyped).toHaveBeenCalledWith(ENTRY, COMPANY, { status: "Paid", dueDate: null });
    await expect(remove({ ...manager, role: "admin" })).resolves.toBeUndefined();
    expect(repo.softDeleteTyped).toHaveBeenCalledWith(ENTRY, COMPANY);
  });

  it("refuses, not done on a guess, when Invoicing can't be asked", async () => {
    repo.getByIdForCompany.mockResolvedValue(entryRow());
    issuedNumbers.mockRejectedValue(new Error("invoicing down"));
    await expect(change(manager)).rejects.toMatchObject({
      code: "unavailable",
      message: "Could not check whether invoice 2026-117 was issued in Invoicing, so it was not changed: try again in a moment",
    });
    await expect(remove(manager)).rejects.toMatchObject({
      code: "unavailable",
      message: "Could not check whether invoice 2026-117 was issued in Invoicing, so it was not deleted: try again in a moment",
    });
    expect(repo.updateTyped).not.toHaveBeenCalled();
    expect(repo.softDeleteTyped).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("answers with the posted refusal when Invoicing posted the entry between the check and the write", async () => {
    repo.getByIdForCompany.mockResolvedValueOnce(entryRow()).mockResolvedValueOnce(entryRow({ source: "invoicing" }));
    repo.updateTyped.mockResolvedValue(null);
    await expect(change(manager)).rejects.toMatchObject({ code: "failed_precondition", message: POSTED_INVOICE_REFUSAL });
  });

  it("answers not found for an entry that is not there (or an id that is no id)", async () => {
    repo.getByIdForCompany.mockResolvedValue(null);
    await expect(change(manager)).rejects.toMatchObject({ code: "not_found" });
    await expect(invoiceService.softDelete("nope", manager)).rejects.toMatchObject({ code: "not_found" });
    expect(repo.getByIdForCompany).toHaveBeenCalledTimes(1);
  });
});

describe("adding an invoice to the customer's list by hand", () => {
  it("is for managers only", async () => {
    await expect(invoiceService.create(user, CUSTOMER, { invoiceNumber: "2026-118", amount: 10 })).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.createForCompany).not.toHaveBeenCalled();
  });

  it("is a typed entry, in the customer's currency", async () => {
    const item = await invoiceService.create(manager, CUSTOMER, { invoiceNumber: "2026-118", amount: 10 });
    expect(repo.createForCompany).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ invoiceNumber: "2026-118", currency: "EUR", source: "typed" }));
    expect(item.source).toBe("typed");
    expect(issuedNumbers).toHaveBeenCalledWith({ numbers: ["2026-118"] });
  });

  it("is refused for a number Invoicing issued, as an edit is", async () => {
    issuedNumbers.mockResolvedValue({ numbers: ["INV2026CZ00000028-001"] });
    await expect(invoiceService.create(manager, CUSTOMER, { invoiceNumber: "INV2026CZ00000028-001", amount: 10 })).rejects.toMatchObject({
      code: "failed_precondition",
      message: POSTED_INVOICE_REFUSAL,
    });
    expect(repo.createForCompany).not.toHaveBeenCalled();
  });

  it("is refused, not added on a guess, when Invoicing can't be asked", async () => {
    issuedNumbers.mockRejectedValue(new Error("invoicing down"));
    await expect(invoiceService.create(manager, CUSTOMER, { invoiceNumber: "2026-118", amount: 10 })).rejects.toMatchObject({
      code: "unavailable",
      message: "Could not check whether invoice 2026-118 was issued in Invoicing, so it was not added: try again in a moment",
    });
    expect(repo.createForCompany).not.toHaveBeenCalled();
  });
});

describe("Accounts Receivable's word on an invoice (the receiver)", () => {
  const word = { customerId: CUSTOMER, invoiceId: INVOICE, invoiceNumber: "INV2026CZ00000028-001", leftToPay: 0, lastPaidOn: "2026-11-17", settled: true, creditNoteNumbers: ["CN-1", "CN-1", ""] };

  it("is written on the entry with the credit notes named once; false (not an error) when the invoice has no entry", async () => {
    repo.applyReceivable.mockResolvedValue(false);
    await expect(invoiceService.applyReceivable(COMPANY, word)).resolves.toBe(false);
    // No invoice status sent (an older sender): the invoice is issued.
    expect(repo.applyReceivable).toHaveBeenCalledWith(COMPANY, { ...word, invoiceStatus: "issued", creditNoteNumbers: ["CN-1"] });
  });

  it("passes the invoice's own status on, and refuses one it does not know", async () => {
    repo.applyReceivable.mockResolvedValue(true);
    await invoiceService.applyReceivable(COMPANY, { ...word, invoiceStatus: "cancelled" });
    expect(repo.applyReceivable).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ invoiceStatus: "cancelled" }));
    repo.applyReceivable.mockClear();
    await expect(invoiceService.applyReceivable(COMPANY, { ...word, invoiceStatus: "paid" as never })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.applyReceivable).not.toHaveBeenCalled();
  });

  it("refuses a word it can't read, before anything is written", async () => {
    await expect(invoiceService.applyReceivable(COMPANY, { ...word, lastPaidOn: "17.11.2026" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(invoiceService.applyReceivable(COMPANY, { ...word, invoiceId: "x" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(invoiceService.applyReceivable(COMPANY, { ...word, leftToPay: Number.NaN })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.applyReceivable).not.toHaveBeenCalled();
  });
});

describe("the customer's list as Accounts Receivable reads it", () => {
  it("gives each document's entry status and last payment day, null for one the list does not have", async () => {
    const OTHER = "00000000-0000-0000-0000-0000000000a2";
    repo.entriesOfIssued.mockResolvedValue(new Map([[INVOICE, entryRow({ status: "Paid", paidOn: "2026-11-02", source: "invoicing", invoiceId: INVOICE })]]));
    await expect(
      invoiceService.statusesOfIssued(COMPANY, [
        { invoiceId: INVOICE, number: "2026-117", customerId: CUSTOMER },
        { invoiceId: OTHER, number: "2026-200", customerId: CUSTOMER },
        { invoiceId: "nope", number: "2026-201", customerId: CUSTOMER },
      ]),
    ).resolves.toEqual([
      { invoiceId: INVOICE, status: "Paid", paidOn: "2026-11-02" },
      { invoiceId: OTHER, status: null, paidOn: null },
      { invoiceId: "nope", status: null, paidOn: null },
    ]);
    // An id that is no id is never asked for.
    expect(repo.entriesOfIssued).toHaveBeenCalledWith(COMPANY, [
      { invoiceId: INVOICE, number: "2026-117", customerId: CUSTOMER },
      { invoiceId: OTHER, number: "2026-200", customerId: CUSTOMER },
    ]);
  });
});
