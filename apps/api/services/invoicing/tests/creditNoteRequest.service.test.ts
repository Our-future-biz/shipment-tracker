import { beforeEach, describe, expect, it, vi } from "vitest";

const requests = vi.hoisted(() => ({
  create: vi.fn(),
  byId: vi.fn(),
  pendingFor: vi.fn(),
  reject: vi.fn(),
  withdraw: vi.fn(),
  list: vi.fn(),
  pending: vi.fn(),
  answersFor: vi.fn(),
}));
const docs = vi.hoisted(() => ({ creditState: vi.fn(), issuePartialCredit: vi.fn() }));
const changeRequests = vi.hoisted(() => ({ pendingFor: vi.fn() }));
const TODAY = "2026-11-17";

vi.mock("../repositories/creditNoteRequest.repository", () => ({ creditNoteRequestRepository: requests }));
vi.mock("../services/invoiceDocument.service", () => ({ invoiceDocumentService: docs, pragueToday: () => TODAY }));
vi.mock("../repositories/invoiceChangeRequest.repository", () => ({ invoiceChangeRequestRepository: changeRequests }));
vi.mock("../../../lib/companyUsers", () => ({ userEmailOf: async (id: string) => `${id}@test.cz` }));
vi.mock("encore.dev/api", () => {
  const err = (code: string) => (message: string) => Object.assign(new Error(message), { code });
  return {
    APIError: { notFound: err("not_found"), invalidArgument: err("invalid_argument"), failedPrecondition: err("failed_precondition"), permissionDenied: err("permission_denied") },
  };
});

import { creditNoteRequestService } from "../services/creditNoteRequest.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const REQUEST = "00000000-0000-0000-0000-0000000000f1";
const user = { userID: "u-rep", companyID: COMPANY, role: "user" };
const manager = { userID: "u-boss", companyID: COMPANY, role: "manager" };

const original = {
  id: "inv1", kind: "invoice", status: "issued", number: "INV2026CZ00000028-001", shipmentId: "ship1", currency: "EUR", fxRate: "25.000000", gross: "363.00",
  shipment: { jobNumber: "CZ00000028", jobYear: 2026 }, customer: { companyName: "Zákazník a.s." },
};
const remaining = [
  { lineId: "l1", description: "THC", qty: 1, unitPrice: 200, unitCurrency: "EUR", fxRate: 1, vatCode: "S21", vatRate: 21, sourceSellingCostId: "s1", amount: 200, remainingAmount: 200, net: 200, remainingNet: 200 },
  { lineId: "l2", description: "Customs", qty: 1, unitPrice: 100, unitCurrency: "EUR", fxRate: 1, vatCode: "S21", vatRate: 21, sourceSellingCostId: "s2", amount: 100, remainingAmount: 100, net: 100, remainingNet: 100 },
];
const row = (over: Record<string, unknown> = {}) => ({
  id: REQUEST, companyId: COMPANY, shipmentId: "ship1", jobNumber: "CZ00000028", invoiceId: "inv1", invoiceNumber: original.number, customerName: "Zákazník a.s.",
  currency: "EUR", lines: [], net: "50.00", vat: "10.50", gross: "60.50", invoiceGross: "363.00", reason: "Agreed discount", status: "pending",
  requestedById: "u-rep", requestedByName: "u-rep@test.cz", requestedAt: new Date("2026-11-17T08:00:00Z"), decidedByName: "", decidedAt: null, comment: "",
  selfDecision: false, answerSeenAt: null, creditNoteId: null, creditNoteNumber: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  docs.creditState.mockResolvedValue({ original, credits: [], remaining });
  changeRequests.pendingFor.mockResolvedValue(null);
  requests.create.mockImplementation(async (values: Record<string, unknown>) => row(values));
});

describe("asking for a partial credit note", () => {
  it("records what comes off, line by line, for a manager to answer", async () => {
    const asked = await creditNoteRequestService.ask(user, "inv1", { lines: [{ lineId: "l1", amount: "50" }], reason: "  Agreed discount  " });
    expect(requests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "inv1", invoiceNumber: original.number, jobNumber: "CZ00000028", customerName: "Zákazník a.s.", currency: "EUR",
        lines: [{ lineId: "l1", description: "THC", unitCurrency: "EUR", amount: "50.00", net: "50.00" }],
        net: "50.00", vat: "10.50", gross: "60.50", invoiceGross: "363.00", reason: "Agreed discount", requestedById: "u-rep", requestedByName: "u-rep@test.cz",
      }),
    );
    expect(asked.status).toBe("pending");
    expect(docs.issuePartialCredit).not.toHaveBeenCalled();
  });

  it("needs a reason, a valid amount, and less than the whole invoice", async () => {
    await expect(creditNoteRequestService.ask(user, "inv1", { lines: [{ lineId: "l1", amount: "50" }], reason: " " })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(creditNoteRequestService.ask(user, "inv1", { lines: [{ lineId: "l1", amount: "250" }], reason: "Discount" })).rejects.toMatchObject({
      code: "invalid_argument",
      message: '"THC" has 200.00 EUR left to credit',
    });
    await expect(creditNoteRequestService.ask(user, "inv1", { lines: [{ lineId: "l1", amount: "200" }, { lineId: "l2", amount: "100" }], reason: "Discount" })).rejects.toMatchObject({
      message: expect.stringMatching(/whole invoice/),
    });
    expect(requests.create).not.toHaveBeenCalled();
  });

  it("refuses a credited invoice, and a second request while one waits", async () => {
    docs.creditState.mockResolvedValueOnce({ original: { ...original, status: "credited" }, credits: [], remaining });
    await expect(creditNoteRequestService.ask(user, "inv1", { lines: [{ lineId: "l1", amount: "5" }], reason: "Discount" })).rejects.toThrow(/already been credited/);
    requests.create.mockResolvedValueOnce(null);
    await expect(creditNoteRequestService.ask(user, "inv1", { lines: [{ lineId: "l1", amount: "5" }], reason: "Discount" })).rejects.toThrow(/already waits for a manager/);
  });

  it("refuses while a change of the invoice waits today, naming it and when it was asked (B5)", async () => {
    changeRequests.pendingFor.mockResolvedValueOnce({ id: "ch1", issueDate: TODAY, requestedAt: new Date("2026-11-17T08:13:00Z") });
    await expect(creditNoteRequestService.ask(user, "inv1", { lines: [{ lineId: "l1", amount: "5" }], reason: "Discount" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "A change of this invoice is waiting for approval (asked 17.11.2026 09:13): wait for it or take it back",
    });
    expect(changeRequests.pendingFor).toHaveBeenCalledWith(COMPANY, "inv1");
    expect(requests.create).not.toHaveBeenCalled();
  });

  it("a change still marked waiting from an earlier issue day has expired: it does not stand in the way", async () => {
    changeRequests.pendingFor.mockResolvedValueOnce({ id: "ch1", issueDate: "2026-11-16", requestedAt: new Date("2026-11-16T08:13:00Z") });
    await expect(creditNoteRequestService.ask(user, "inv1", { lines: [{ lineId: "l1", amount: "50" }], reason: "Discount" })).resolves.toMatchObject({ status: "pending" });
  });
});

describe("answering", () => {
  it("is for a manager only", async () => {
    await expect(creditNoteRequestService.answer(user, REQUEST, { decision: "approve" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(creditNoteRequestService.list(user)).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("approving issues the credit note", async () => {
    requests.byId.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: "approved", creditNoteNumber: "CN2026CZ00000028-001" }));
    const done = await creditNoteRequestService.answer(manager, REQUEST, { decision: "approve" });
    expect(docs.issuePartialCredit).toHaveBeenCalledWith(expect.objectContaining({ id: REQUEST }), { userId: "u-boss", userEmail: "u-boss@test.cz", comment: "" });
    expect(done).toMatchObject({ status: "approved", creditNoteNumber: "CN2026CZ00000028-001" });
  });

  it("rejecting needs a reason and issues nothing", async () => {
    requests.byId.mockResolvedValue(row());
    await expect(creditNoteRequestService.answer(manager, REQUEST, { decision: "reject", comment: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    requests.reject.mockResolvedValue(row({ status: "rejected", comment: "No discount agreed" }));
    await creditNoteRequestService.answer(manager, REQUEST, { decision: "reject", comment: "No discount agreed" });
    expect(requests.reject).toHaveBeenCalledWith(COMPANY, REQUEST, { userId: "u-boss", userEmail: "u-boss@test.cz", comment: "No discount agreed" });
    expect(docs.issuePartialCredit).not.toHaveBeenCalled();
  });

  it("says who answered a request already answered", async () => {
    requests.byId.mockResolvedValue(row({ status: "approved", decidedByName: "other@test.cz" }));
    await expect(creditNoteRequestService.answer(manager, REQUEST, { decision: "approve" })).rejects.toThrow("This request was already approved by other@test.cz");
  });
});

describe("taking it back", () => {
  it("is for the one who asked only", async () => {
    requests.byId.mockResolvedValue(row());
    await expect(creditNoteRequestService.withdraw(manager, REQUEST)).rejects.toMatchObject({ code: "permission_denied" });
    requests.withdraw.mockResolvedValue(row({ status: "withdrawn" }));
    await expect(creditNoteRequestService.withdraw(user, REQUEST)).resolves.toMatchObject({ status: "withdrawn" });
  });
});

describe("the bell", () => {
  it("shows a manager what waits, except their own requests, and anyone the answers to theirs", async () => {
    requests.pending.mockResolvedValue([row(), row({ id: "r2", requestedById: "u-boss" })]);
    requests.answersFor.mockResolvedValue([]);
    expect((await creditNoteRequestService.forMe(manager)).waiting.map((r) => r.id)).toEqual([REQUEST]);
    expect((await creditNoteRequestService.forMe(user)).waiting).toEqual([]);
  });
});
