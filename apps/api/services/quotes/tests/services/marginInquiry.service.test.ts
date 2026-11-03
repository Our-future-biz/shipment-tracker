import { beforeEach, describe, expect, it, vi } from "vitest";

// What a margin inquiry does - ask, answer, withdraw - run for real against stand-ins for the
// quote's row lock, the inquiry table, the rates and the users.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn() } }));
vi.mock("../../services/marginRates", () => ({ marginsFor: vi.fn() }));
vi.mock("../../lib/people", () => ({ companyPeople: vi.fn() }));
vi.mock("../../repositories/quoteComment.repository", () => ({ quoteCommentRepository: { createForCompany: vi.fn() } }));
const TX = vi.hoisted(() => ({ fake: "tx" }));
vi.mock("../../repositories/salesQuote.repository", () => ({
  salesQuoteRepository: {
    loadSales: vi.fn(),
    withLockedQuote: vi.fn(),
    writeLifecycle: vi.fn(),
  },
}));
vi.mock("../../repositories/quoteInquiry.repository", () => ({
  quoteInquiryRepository: { insert: vi.fn(), pendingOf: vi.fn(), answer: vi.fn(), byId: vi.fn(), latestOf: vi.fn(), list: vi.fn(), pending: vi.fn(), answersFor: vi.fn(), markSeen: vi.fn() },
}));

import { auth } from "~encore/clients";
import { marginsFor } from "../../services/marginRates";
import { companyPeople } from "../../lib/people";
import { salesQuoteRepository } from "../../repositories/salesQuote.repository";
import { quoteInquiryRepository } from "../../repositories/quoteInquiry.repository";
import { marginInquiryService } from "../../services/marginInquiry.service";
import type { QuoteInquiryRecord } from "../../schemas/quoteInquiry.schema";
import type { SalesQuoteRecord } from "../../schemas/quote.schema";
import { guardrailSettings } from "../../lib/guardrails";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const REP = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const BOSS = "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c01";
const INQUIRY = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const REF = "QCZ20261103001";
const rep = { userID: REP, companyID: COMPANY, role: "user" };
const boss = { userID: BOSS, companyID: COMPANY, role: "manager" };

// A Road draft in CZK selling 10 000 and buying 9 600: 4 %, below the 8 % / 300 CZK floor.
const quote = (over: Record<string, unknown> = {}) =>
  ({
    id: "q-1",
    quoteNumber: REF,
    status: "draft",
    validUntil: null,
    ownerUserId: REP,
    ownerLabel: "",
    substatus: null,
    lostReason: null,
    lostComment: null,
    sentAt: null,
    firstSentAt: null,
    decidedAt: null,
    lastContactAt: null,
    shipmentId: null,
    shipmentJobNumber: null,
    dataVersion: 3,
    data: { serviceType: "Road", currency: "CZK", sellingLines: [{ currency: "CZK", amount: 10000 }], buyingLines: [{ currency: "CZK", amount: 9600 }] },
    ...over,
  }) as unknown as SalesQuoteRecord;
const MARGINS = { settings: guardrailSettings([], { percent: 8, minAmountCzk: 300 }), today: "2026-11-03", rates: {}, roePct: 100 };
const pending = (over: Partial<QuoteInquiryRecord> = {}) =>
  ({
    id: INQUIRY,
    companyId: COMPANY,
    quoteId: "q-1",
    quoteNumber: REF,
    kind: "margin",
    status: "pending",
    requestedById: REP,
    requestedAt: new Date("2026-11-03T08:00:00Z"),
    reason: "Competitor price",
    note: "",
    needsBy: null,
    competitorPrice: "",
    volume: "",
    snapshot: { sellingCzk: 10000, buyingCzk: 9600, marginCzk: 400, marginPercent: 4, floorPercent: 8, floorMinCzk: 300 },
    notifyUserId: BOSS,
    decision: null,
    decidedById: null,
    decidedAt: null,
    approvedMarginCzk: null,
    approvedMarginPercent: null,
    comment: "",
    selfDecision: false,
    answerSeenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...over,
  }) as QuoteInquiryRecord;

let stored: SalesQuoteRecord;
beforeEach(() => {
  vi.resetAllMocks();
  stored = quote();
  vi.mocked(companyPeople).mockResolvedValue({ users: [], emails: new Map([[REP, "jan@forwarder.cz"], [BOSS, "marie@forwarder.cz"]]) });
  vi.mocked(auth.usersList).mockResolvedValue({
    users: [
      { id: REP, companyId: COMPANY, email: "jan@forwarder.cz", displayName: "", role: "user", departmentId: null, branchId: null, reportsToUserId: BOSS },
      { id: BOSS, companyId: COMPANY, email: "marie@forwarder.cz", displayName: "", role: "manager", departmentId: null, branchId: null, reportsToUserId: null },
    ],
  } as never);
  vi.mocked(marginsFor).mockResolvedValue(MARGINS);
  vi.mocked(salesQuoteRepository.loadSales).mockImplementation(async () => stored);
  vi.mocked(salesQuoteRepository.withLockedQuote).mockImplementation(async (_c, _n, change) => change(stored, TX as never));
  vi.mocked(salesQuoteRepository.writeLifecycle).mockImplementation(async (_tx, row) => row);
  vi.mocked(quoteInquiryRepository.insert).mockImplementation(async (row) => pending(row as Partial<QuoteInquiryRecord>));
});

const written = () => vi.mocked(salesQuoteRepository.writeLifecycle).mock.calls[0]![2];

describe("ask", () => {
  it("stores the question with the margin as it is, tells the owner's manager, and writes a history line without a new version", async () => {
    const item = await marginInquiryService.ask(rep, REF, { reason: "Competitor price", note: "Maersk is cheaper" });
    const row = vi.mocked(quoteInquiryRepository.insert).mock.calls[0]![0];
    expect(row).toMatchObject({ quoteId: "q-1", kind: "margin", requestedById: REP, notifyUserId: BOSS, snapshot: { marginCzk: 400, marginPercent: 4, floorPercent: 8 } });
    expect(written()).toEqual({ state: expect.anything(), entries: [expect.objectContaining({ kind: "margin_approval", comment: "Margin approval asked: 400 CZK (4 %) - Competitor price: Maersk is cheaper" })] });
    expect(written()).not.toHaveProperty("document");
    expect(item).toMatchObject({ status: "pending", notifyName: "marie@forwarder.cz", escalated: false });
  });

  it("refuses a margin that is not below the floor, a sent quote, and a second question", async () => {
    stored = quote({ data: { ...quote().data as object, buyingLines: [{ currency: "CZK", amount: 5000 }] } });
    await expect(marginInquiryService.ask(rep, REF, { reason: "Retention" })).rejects.toMatchObject({ code: "failed_precondition" });
    stored = quote({ status: "quoted" });
    await expect(marginInquiryService.ask(rep, REF, { reason: "Retention" })).rejects.toMatchObject({ code: "failed_precondition" });
    stored = quote();
    vi.mocked(quoteInquiryRepository.insert).mockResolvedValue(null);
    await expect(marginInquiryService.ask(rep, REF, { reason: "Retention" })).rejects.toMatchObject({ message: "A question about this margin is already waiting for a manager" });
  });

  it("tells the admins when the owner reports to nobody", async () => {
    vi.mocked(auth.usersList).mockResolvedValue({ users: [{ id: REP, companyId: COMPANY, email: "jan@forwarder.cz", displayName: "", role: "user", departmentId: null, branchId: null, reportsToUserId: null }] } as never);
    const item = await marginInquiryService.ask(rep, REF, { reason: "Retention" });
    expect(vi.mocked(quoteInquiryRepository.insert).mock.calls[0]![0]).toMatchObject({ notifyUserId: null });
    expect(item.escalated).toBe(true);
  });
});

describe("decide", () => {
  beforeEach(() => {
    vi.mocked(quoteInquiryRepository.pendingOf).mockResolvedValue(pending());
    vi.mocked(quoteInquiryRepository.answer).mockImplementation(async (_c, _id, patch) => pending(patch as Partial<QuoteInquiryRecord>));
  });

  it("is for managers only", async () => {
    await expect(marginInquiryService.decide(rep, REF, INQUIRY, { decision: "approve" })).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("approves the margin asked about: the approval the gate reads, stored as a server key", async () => {
    await marginInquiryService.decide(boss, REF, INQUIRY, { decision: "approve" });
    expect(vi.mocked(quoteInquiryRepository.answer).mock.calls[0]![2]).toMatchObject({ status: "approved", decision: "approve", approvedMarginCzk: 400, selfDecision: false });
    const w = written();
    expect(w.serverKeys).toEqual({ marginApproval: expect.objectContaining({ byUserId: BOSS, marginCzk: 400, marginPercent: 4, reason: "Approved on request: Competitor price" }) });
    expect(w).not.toHaveProperty("document");
    expect(w.entries[0]!.comment).toBe("Margin approved: 400 CZK (4 %) - Approved on request: Competitor price");
  });

  it("approves down to a counter margin, and rejects with a reason", async () => {
    await marginInquiryService.decide(boss, REF, INQUIRY, { decision: "counter", counterMarginCzk: 600, comment: "aim for 600" });
    expect(written().serverKeys).toEqual({ marginApproval: expect.objectContaining({ marginCzk: 600, marginPercent: 6 }) });
    expect(written().entries[0]!.comment).toBe("Margin approved down to 600 CZK (6 %) - aim for 600");

    vi.mocked(salesQuoteRepository.writeLifecycle).mockClear();
    await marginInquiryService.decide(boss, REF, INQUIRY, { decision: "reject", comment: "too thin for this lane" });
    expect(written()).not.toHaveProperty("serverKeys");
    expect(written().entries[0]!.comment).toBe("Margin approval rejected: too thin for this lane");
  });

  it("allows a manager to answer for their own quote, and says so (D9)", async () => {
    stored = quote({ ownerUserId: BOSS });
    await marginInquiryService.decide(boss, REF, INQUIRY, { decision: "approve" });
    expect(vi.mocked(quoteInquiryRepository.answer).mock.calls[0]![2]).toMatchObject({ selfDecision: true });
    expect(written().entries[0]!.comment).toMatch(/\(self-approval\)$/);
  });

  it("tells who answered first when the question no longer waits", async () => {
    vi.mocked(quoteInquiryRepository.pendingOf).mockResolvedValue(null);
    vi.mocked(quoteInquiryRepository.byId).mockResolvedValue(pending({ status: "approved", decidedById: BOSS }));
    await expect(marginInquiryService.decide(boss, REF, INQUIRY, { decision: "approve" })).rejects.toMatchObject({ message: "This question was already approved by marie@forwarder.cz" });
  });
});

describe("withdraw", () => {
  it("lets the one who asked take it back, nobody else but a manager", async () => {
    vi.mocked(quoteInquiryRepository.pendingOf).mockResolvedValue(pending());
    vi.mocked(quoteInquiryRepository.answer).mockImplementation(async (_c, _id, patch) => pending(patch as Partial<QuoteInquiryRecord>));
    await expect(marginInquiryService.withdraw({ ...rep, userID: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c09" }, REF, INQUIRY)).rejects.toMatchObject({ code: "permission_denied" });
    expect((await marginInquiryService.withdraw(rep, REF, INQUIRY)).status).toBe("withdrawn");
  });
});
