import { beforeEach, describe, expect, it, vi } from "vitest";

// The rules around the number, against a stand-in for the repository (which holds the writes).
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
const repo = vi.hoisted(() => ({ change: vi.fn(), answer: vi.fn(), byId: vi.fn(), withdraw: vi.fn(), list: vi.fn(), ofShipment: vi.fn(), pending: vi.fn(), answersFor: vi.fn(), markSeen: vi.fn(), askRemoval: vi.fn() }));
vi.mock("../../repositories/sellingAmountRequest.repository", () => ({ sellingAmountRequestRepository: repo }));
vi.mock("../../../../lib/companyUsers", () => ({ userEmailOf: async () => "rep@example.test" }));
vi.mock("../../../../lib/shipmentRefs", () => ({ assertShipmentExists: async () => ({ jobNumber: "CZ00000024" }) }));

import { sellingAmountRequestService as service } from "../../services/sellingAmountRequest.service";

const SHIPMENT = "8c4fac0e-543c-4276-bd04-168388d3f353";
const SELLING = "9a1c6f8e-2b7d-4c1e-8f3a-5d6b7c8e9f01";
const REQUEST = "9a1c6f8e-2b7d-4c1e-8f3a-5d6b7c8e9f02";
const rep = { userID: "u1", companyID: "c1", role: "user" };
const manager = { userID: "m1", companyID: "c1", role: "manager" };

const record = (over: Record<string, unknown> = {}) => ({
  id: REQUEST, shipmentId: SHIPMENT, jobNumber: "CZ00000024", sellingCostId: SELLING, kind: "amount", category: "container_demurrage", currency: "EUR", costAmount: "89.89",
  currentAmount: "89.89", requestedAmount: "50.00", reason: "Customer goodwill", status: "pending", requestedById: "u1", requestedByName: "rep@example.test",
  requestedAt: new Date("2026-11-07T10:00:00Z"), decidedByName: "", decidedAt: null, comment: "", selfDecision: false, ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("changing the number", () => {
  it("passes the amount and reason on, with who asks and the job", async () => {
    repo.change.mockResolvedValue({ outcome: "asked", request: record() });
    const out = await service.change(rep, SHIPMENT, SELLING, { amount: "50.00", reason: "  Customer goodwill " });
    expect(repo.change).toHaveBeenCalledWith("c1", SHIPMENT, SELLING, { amount: "50.00", reason: "Customer goodwill", userId: "u1", userEmail: "rep@example.test", jobNumber: "CZ00000024" });
    expect(out).toMatchObject({ outcome: "asked", request: { requestedAmount: "50.00", status: "pending" } });
  });

  it("says when it was written at once", async () => {
    repo.change.mockResolvedValue({ outcome: "saved", row: {} });
    expect(await service.change(rep, SHIPMENT, SELLING, { amount: "120.00" })).toEqual({ outcome: "saved", request: null });
  });

  it("refuses what is no amount, or below zero, before anything is written", async () => {
    await expect(service.change(rep, SHIPMENT, SELLING, { amount: "abc" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.change(rep, SHIPMENT, SELLING, { amount: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.change(rep, SHIPMENT, SELLING, { amount: "-1" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.change(rep, SHIPMENT, SELLING, { amount: "50", reason: "x" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.change).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", "not_found"],
    ["invoiced", "failed_precondition"],
    ["no_cost", "failed_precondition"],
    ["reason_needed", "invalid_argument"],
    ["already_waiting", "failed_precondition"],
  ])("answers %s with %s", async (outcome, code) => {
    repo.change.mockResolvedValue({ outcome, cost: "89.89" });
    await expect(service.change(rep, SHIPMENT, SELLING, { amount: "50.00" })).rejects.toMatchObject({ code });
  });
});

describe("a manager's answer", () => {
  it("is for managers only", async () => {
    await expect(service.answer(rep, REQUEST, { decision: "approve" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.list(rep)).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.answer).not.toHaveBeenCalled();
  });

  it("approves, with who answered", async () => {
    repo.answer.mockResolvedValue({ outcome: "done", request: record({ status: "approved" }) });
    const out = await service.answer(manager, REQUEST, { decision: "approve" });
    expect(repo.answer).toHaveBeenCalledWith("c1", REQUEST, { approve: true, comment: "", userId: "m1", userEmail: "rep@example.test" });
    expect(out.status).toBe("approved");
  });

  it("wants a reason for a rejection", async () => {
    await expect(service.answer(manager, REQUEST, { decision: "reject", comment: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.answer).not.toHaveBeenCalled();
  });

  it.each(["answered_already", "invoiced", "row_gone", "cost_changed"])("refuses when %s", async (outcome) => {
    repo.answer.mockResolvedValue({ outcome, cost: "95.00", request: record({ status: "rejected", decidedByName: "boss@example.test" }) });
    await expect(service.answer(manager, REQUEST, { decision: "approve" })).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("taking a request back", () => {
  it("is for the one who asked only: a manager rejects it, with a reason", async () => {
    repo.byId.mockResolvedValue(record());
    repo.withdraw.mockResolvedValue(record({ status: "withdrawn" }));
    await expect(service.withdraw({ ...rep, userID: "someone" }, REQUEST)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.withdraw(manager, REQUEST)).rejects.toMatchObject({ code: "permission_denied" });
    expect((await service.withdraw(rep, REQUEST)).status).toBe("withdrawn");
  });

  it("says when it no longer waits", async () => {
    repo.byId.mockResolvedValue(record());
    repo.withdraw.mockResolvedValue(null);
    await expect(service.withdraw(rep, REQUEST)).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("the bell", () => {
  beforeEach(() => {
    repo.pending.mockResolvedValue([record()]);
    repo.answersFor.mockResolvedValue([record({ status: "rejected", comment: "Too low", answerSeenAt: new Date("2026-11-07T11:00:00Z") })]);
  });

  it("shows a manager what waits, and the answers to what they asked", async () => {
    const bell = await service.forMe(manager);
    expect(bell.waiting.map((r) => r.id)).toEqual([REQUEST]);
    expect(bell.answers[0]).toMatchObject({ status: "rejected", answerSeenAt: "2026-11-07T11:00:00.000Z" });
    expect(repo.answersFor).toHaveBeenCalledWith("c1", "m1", expect.any(Date), expect.any(Date), expect.any(Number));
  });

  it("shows anyone else only the answers to what they asked", async () => {
    const bell = await service.forMe(rep);
    expect(bell.waiting).toEqual([]);
    expect(repo.pending).not.toHaveBeenCalled();
    expect(bell.answers).toHaveLength(1);
  });

  it("marks only real ids as seen, for the one who opened them", async () => {
    await service.seen(rep, [REQUEST, "not-an-id"]);
    expect(repo.markSeen).toHaveBeenCalledWith("c1", "u1", [REQUEST], expect.any(Date));
  });
});

describe("asking to take the row off", () => {
  it("passes the reason on, with who asks and the job", async () => {
    repo.askRemoval.mockResolvedValue({ outcome: "asked", request: record({ kind: "remove", requestedAmount: "0.00" }) });
    const out = await service.askRemoval(rep, SHIPMENT, SELLING, { reason: "  Customer disputes it " });
    expect(repo.askRemoval).toHaveBeenCalledWith("c1", SHIPMENT, SELLING, { reason: "Customer disputes it", userId: "u1", userEmail: "rep@example.test", jobNumber: "CZ00000024" });
    expect(out).toMatchObject({ kind: "remove", status: "pending" });
  });

  it("wants a reason, before anything is written", async () => {
    await expect(service.askRemoval(rep, SHIPMENT, SELLING, { reason: " x " })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.askRemoval).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", "not_found"],
    ["invoiced", "failed_precondition"],
    ["no_cost", "failed_precondition"],
    ["already_waiting", "failed_precondition"],
  ])("answers %s with %s", async (outcome, code) => {
    repo.askRemoval.mockResolvedValue({ outcome });
    await expect(service.askRemoval(rep, SHIPMENT, SELLING, { reason: "Disputed" })).rejects.toMatchObject({ code });
  });
});
