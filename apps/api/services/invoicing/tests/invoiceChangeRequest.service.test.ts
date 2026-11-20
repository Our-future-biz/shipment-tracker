import { beforeEach, describe, expect, it, vi } from "vitest";

const requests = vi.hoisted(() => ({
  create: vi.fn(),
  byId: vi.fn(),
  reject: vi.fn(),
  expire: vi.fn(),
  withdraw: vi.fn(),
  expireStale: vi.fn(),
  list: vi.fn(),
  pending: vi.fn(),
  answersFor: vi.fn(),
}));
const invoices = vi.hoisted(() => ({ getByIdForCompany: vi.fn(), creditNotesOf: vi.fn() }));
const docs = vi.hoisted(() => ({ cancelOnIssueDay: vi.fn() }));
const creditRequests = vi.hoisted(() => ({ pendingFor: vi.fn() }));
const TODAY = "2026-11-17";

vi.mock("../repositories/invoiceChangeRequest.repository", () => ({ invoiceChangeRequestRepository: requests }));
vi.mock("../repositories/invoice.repository", () => ({ invoiceRepository: invoices }));
vi.mock("../repositories/creditNoteRequest.repository", () => ({ creditNoteRequestRepository: creditRequests }));
vi.mock("../services/invoiceDocument.service", () => ({ invoiceDocumentService: docs, pragueToday: () => TODAY }));
vi.mock("../../../lib/companyUsers", () => ({ userEmailOf: async (id: string) => `${id}@test.cz` }));
vi.mock("encore.dev/api", () => {
  const err = (code: string) => (message: string) => Object.assign(new Error(message), { code });
  return {
    APIError: { notFound: err("not_found"), invalidArgument: err("invalid_argument"), failedPrecondition: err("failed_precondition"), permissionDenied: err("permission_denied") },
  };
});

import { invoiceChangeRequestService } from "../services/invoiceChangeRequest.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const INVOICE = "00000000-0000-0000-0000-0000000000a1";
const REQUEST = "00000000-0000-0000-0000-0000000000c1";
const user = { userID: "u-rep", companyID: COMPANY, role: "user" };
const manager = { userID: "u-boss", companyID: COMPANY, role: "manager" };
const invoice = {
  id: INVOICE, kind: "invoice", status: "issued", number: "INV2026CZ00000028-001", shipmentId: "ship1", currency: "EUR", gross: "363.00",
  issueDate: TODAY, shipment: { jobNumber: "CZ00000028" }, customer: { companyName: "Zákazník a.s." },
};
const row = (over: Record<string, unknown> = {}) => ({
  id: REQUEST, companyId: COMPANY, shipmentId: "ship1", jobNumber: "CZ00000028", invoiceId: INVOICE, invoiceNumber: invoice.number, customerName: "Zákazník a.s.",
  currency: "EUR", gross: "363.00", issueDate: TODAY, fixes: ["duzp"], reason: "Wrong DUZP", status: "pending", requestedById: "u-rep", requestedByName: "u-rep@test.cz",
  requestedAt: new Date("2026-11-17T08:00:00Z"), decidedByName: "", decidedAt: null, comment: "", selfDecision: false, answerSeenAt: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  invoices.getByIdForCompany.mockResolvedValue(invoice);
  invoices.creditNotesOf.mockResolvedValue([]);
  creditRequests.pendingFor.mockResolvedValue(null);
  requests.create.mockImplementation(async (values: Record<string, unknown>) => row(values));
});

describe("asking to change an invoice", () => {
  it("records what is wrong and why, for a manager to answer, on the invoice's issue day", async () => {
    const asked = await invoiceChangeRequestService.ask(user, INVOICE, { fixes: ["duzp", "lines", "duzp"], reason: " Wrong DUZP and THC amount " });
    expect(requests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: INVOICE, invoiceNumber: invoice.number, jobNumber: "CZ00000028", customerName: "Zákazník a.s.", gross: "363.00", issueDate: TODAY,
        // in the list's order, each once
        fixes: ["lines", "duzp"], reason: "Wrong DUZP and THC amount", requestedById: "u-rep", requestedByName: "u-rep@test.cz",
      }),
      // the check run again under the invoice's lock (S5-4)
      expect.any(Function),
    );
    expect(asked.status).toBe("pending");
    expect(docs.cancelOnIssueDay).not.toHaveBeenCalled();
  });

  it("is refused after the issue day: a credit note corrects the invoice then", async () => {
    invoices.getByIdForCompany.mockResolvedValue({ ...invoice, issueDate: "2026-11-16" });
    await expect(invoiceChangeRequestService.ask(user, INVOICE, { fixes: ["duzp"], reason: "Wrong DUZP" })).rejects.toThrow(/only on its issue day/);
  });

  it("needs a reason and something ticked from the list", async () => {
    await expect(invoiceChangeRequestService.ask(user, INVOICE, { fixes: [], reason: "Wrong DUZP" })).rejects.toThrow(/Tick what is wrong/);
    await expect(invoiceChangeRequestService.ask(user, INVOICE, { fixes: ["colour"], reason: "Wrong DUZP" })).rejects.toThrow(/from the list/);
    await expect(invoiceChangeRequestService.ask(user, INVOICE, { fixes: ["duzp"], reason: "" })).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("is refused for a credit note, a credited or cancelled invoice, or one credited in part, and while another waits", async () => {
    invoices.getByIdForCompany.mockResolvedValueOnce({ ...invoice, kind: "credit_note" });
    await expect(invoiceChangeRequestService.ask(user, INVOICE, { fixes: ["duzp"], reason: "Wrong" })).rejects.toThrow(/credit note can't be changed/);
    invoices.getByIdForCompany.mockResolvedValueOnce({ ...invoice, status: "cancelled" });
    await expect(invoiceChangeRequestService.ask(user, INVOICE, { fixes: ["duzp"], reason: "Wrong" })).rejects.toThrow(/is cancelled already/);
    invoices.creditNotesOf.mockResolvedValueOnce([{ id: "cn" }]);
    await expect(invoiceChangeRequestService.ask(user, INVOICE, { fixes: ["duzp"], reason: "Wrong" })).rejects.toThrow(/credited in part/);
    requests.create.mockResolvedValueOnce(null);
    await expect(invoiceChangeRequestService.ask(user, INVOICE, { fixes: ["duzp"], reason: "Wrong" })).rejects.toThrow(/already waits for a manager/);
  });

  it("is refused while a partial credit note of the invoice waits, naming it and when it was asked (B5)", async () => {
    // 08:13 UTC is 09:13 in Prague in November
    creditRequests.pendingFor.mockResolvedValueOnce({ id: "cr1", requestedAt: new Date("2026-11-17T08:13:00Z") });
    await expect(invoiceChangeRequestService.ask(user, INVOICE, { fixes: ["duzp"], reason: "Wrong" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "A partial credit note for this invoice is waiting for approval (asked 17.11.2026 09:13): wait for it or take it back",
    });
    expect(creditRequests.pendingFor).toHaveBeenCalledWith(COMPANY, INVOICE);
    expect(requests.create).not.toHaveBeenCalled();
  });

  // Mock council S5-4 / X-3: a partial credit asked a second earlier is seen again under the invoice's row lock.
  it("checks again under the invoice's lock, with the insert, so two requests a second apart never both wait", async () => {
    const tx = { tx: true };
    requests.create.mockImplementation(async (values: Record<string, unknown>, guard?: (t: unknown) => Promise<void>) => {
      await guard?.(tx);
      return row(values);
    });
    creditRequests.pendingFor.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "cr1", requestedAt: new Date("2026-11-17T08:13:00Z") });
    await expect(invoiceChangeRequestService.ask(user, INVOICE, { fixes: ["duzp"], reason: "Wrong" })).rejects.toThrow(/partial credit note for this invoice is waiting/);
    expect(creditRequests.pendingFor).toHaveBeenLastCalledWith(COMPANY, INVOICE, tx);
  });
});

describe("answering", () => {
  it("is for a manager only", async () => {
    await expect(invoiceChangeRequestService.answer(user, REQUEST, { decision: "approve" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(invoiceChangeRequestService.list(user)).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("approving on the issue day cancels the invoice", async () => {
    requests.byId.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: "approved" }));
    const done = await invoiceChangeRequestService.answer(manager, REQUEST, { decision: "approve" });
    expect(docs.cancelOnIssueDay).toHaveBeenCalledWith(expect.objectContaining({ id: REQUEST }), { userId: "u-boss", userEmail: "u-boss@test.cz", comment: "" });
    expect(done.status).toBe("approved");
  });

  it("a request from an earlier day has expired: it is marked so and nothing is cancelled", async () => {
    requests.byId.mockResolvedValue(row({ issueDate: "2026-11-16" }));
    await expect(invoiceChangeRequestService.answer(manager, REQUEST, { decision: "approve" })).rejects.toThrow(/expired/);
    expect(requests.expire).toHaveBeenCalledWith(COMPANY, REQUEST);
    expect(docs.cancelOnIssueDay).not.toHaveBeenCalled();
  });

  it("rejecting needs a reason", async () => {
    requests.byId.mockResolvedValue(row());
    await expect(invoiceChangeRequestService.answer(manager, REQUEST, { decision: "reject", comment: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    requests.reject.mockResolvedValue(row({ status: "rejected", comment: "Send a credit note" }));
    await invoiceChangeRequestService.answer(manager, REQUEST, { decision: "reject", comment: "Send a credit note" });
    expect(requests.reject).toHaveBeenCalledWith(COMPANY, REQUEST, { userId: "u-boss", userEmail: "u-boss@test.cz", comment: "Send a credit note" });
  });
});

describe("the lists", () => {
  it("expire what waited past its day before they are read", async () => {
    requests.list.mockResolvedValue([]);
    requests.pending.mockResolvedValue([row(), row({ id: "mine", requestedById: "u-boss" })]);
    requests.answersFor.mockResolvedValue([]);
    await invoiceChangeRequestService.list(manager);
    expect(requests.expireStale).toHaveBeenCalledWith(COMPANY, TODAY);
    // a manager's own request waits for another manager
    expect((await invoiceChangeRequestService.forMe(manager)).waiting.map((r) => r.id)).toEqual([REQUEST]);
  });
});
