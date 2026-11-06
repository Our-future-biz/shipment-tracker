import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  latestForShipment: vi.fn(),
  listForManagers: vi.fn(),
  answersFor: vi.fn(),
  answer: vi.fn(),
  reopen: vi.fn(),
  markSeen: vi.fn(),
}));
const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const service = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { userLookup: vi.fn(async () => ({ users: [{ id: "u", name: "Jan Novák" }] })) } }));
vi.mock("../../repositories/customsOfficeRequest.repository", () => ({ customsOfficeRequestRepository: repo }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: service }));
const comments = vi.hoisted(() => ({ postCustomsOfficeRequestNotice: vi.fn() }));
vi.mock("../../services/comment.service", () => ({ commentService: comments }));

import { customsOfficeRequestService as requests } from "../../services/customsOfficeRequest.service";

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const ID = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const FROM = "CZ521060 Oddělení CÚ celní Ruzyně, Praha 6";
const TO = "CZ100000 Celní úřad v Brně, Brno";
const user = { userID: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c01", companyID: "c1", role: "user" };
const manager = { ...user, userID: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c02", role: "manager" };
const shipment = (over = {}) => ({ id: SHIPMENT, jobNumber: "CZ1", customer: "Alza", customsProcedure: "T1", customsOffice: FROM, ...over });
const request = (over = {}) => ({
  id: ID,
  shipmentId: SHIPMENT,
  jobNumber: "CZ1",
  customer: "Alza",
  fromOffice: FROM,
  toOffice: TO,
  reason: "Wrong office",
  status: "pending",
  requestedById: user.userID,
  requestedByName: "Jan",
  requestedAt: new Date("2026-11-06T10:00:00Z"),
  decidedByName: "",
  decidedAt: null,
  comment: "",
  answerSeenAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  shipments.getByIdForCompany.mockResolvedValue(shipment());
  repo.create.mockImplementation(async (values) => request(values));
  repo.get.mockResolvedValue(request());
  repo.answer.mockImplementation(async (_id, _company, answer) => request(answer));
  service.update.mockResolvedValue({});
});

describe("asking to change a Customs Office", () => {
  it("records the office now, the one asked for, the reason and who asked", async () => {
    const item = await requests.ask(user, SHIPMENT, { toOffice: ` ${TO} `, reason: " Wrong office " });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "c1", shipmentId: SHIPMENT, fromOffice: FROM, toOffice: TO, reason: "Wrong office", requestedById: user.userID, requestedByName: "Jan Novák" }),
    );
    expect(item.jobNumber).toBe("CZ1");
    expect(service.update).not.toHaveBeenCalled();
  });

  it("tells the shipment's chat, as the one asking", async () => {
    await requests.ask(user, SHIPMENT, { toOffice: TO, reason: "Wrong office" });
    expect(comments.postCustomsOfficeRequestNotice).toHaveBeenCalledWith(
      SHIPMENT,
      "c1",
      user.userID,
      expect.objectContaining({ fromOffice: FROM, toOffice: TO, reason: "Wrong office" }),
    );
  });

  it("keeps the request when the message can't be posted", async () => {
    comments.postCustomsOfficeRequestNotice.mockRejectedValueOnce(new Error("chat down"));
    await expect(requests.ask(user, SHIPMENT, { toOffice: TO, reason: "Wrong office" })).resolves.toMatchObject({ status: "pending" });
  });

  it("posts nothing when a request is refused", async () => {
    repo.create.mockResolvedValue(null);
    await expect(requests.ask(user, SHIPMENT, { toOffice: TO, reason: "Wrong office" })).rejects.toThrow("already waiting");
    expect(comments.postCustomsOfficeRequestNotice).not.toHaveBeenCalled();
  });

  it("wants an office from the list, a different one, and a reason", async () => {
    await expect(requests.ask(user, SHIPMENT, { toOffice: "anything", reason: "Wrong office" })).rejects.toThrow("from the list");
    await expect(requests.ask(user, SHIPMENT, { toOffice: TO, reason: "  " })).rejects.toThrow("Say why");
    await expect(requests.ask(user, SHIPMENT, { toOffice: FROM, reason: "Wrong office" })).rejects.toThrow("already the shipment's");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("is only for a T1 shipment with its office chosen", async () => {
    for (const over of [{ customsProcedure: "SCP" }, { customsOffice: "" }]) {
      shipments.getByIdForCompany.mockResolvedValueOnce(shipment(over));
      await expect(requests.ask(user, SHIPMENT, { toOffice: TO, reason: "Wrong office" })).rejects.toThrow("Only a T1 shipment");
    }
  });

  it("refuses a second request while one waits", async () => {
    repo.create.mockResolvedValue(null);
    await expect(requests.ask(user, SHIPMENT, { toOffice: TO, reason: "Wrong office" })).rejects.toThrow("already waiting");
  });
});

describe("answering a request", () => {
  it("is for managers only, listing included", async () => {
    await expect(requests.decide(user, ID, { approve: true })).rejects.toThrow("Only a manager");
    await expect(requests.listForManagers(user)).rejects.toThrow("Only a manager");
    expect(repo.answer).not.toHaveBeenCalled();
  });

  it("approved, puts the new office on the shipment under the manager's name", async () => {
    const item = await requests.decide(manager, ID, { approve: true });
    expect(item.status).toBe("approved");
    expect(item.decidedByName).toBe("Jan Novák");
    // No role passed: the lock is for the person's own edits, this is the approval itself.
    expect(service.update).toHaveBeenCalledWith(SHIPMENT, "c1", { customsOffice: TO }, manager.userID);
  });

  it("rejected, needs a reason and leaves the shipment alone", async () => {
    await expect(requests.decide(manager, ID, { approve: false, comment: " " })).rejects.toThrow("Say why");
    const item = await requests.decide(manager, ID, { approve: false, comment: "Ruzyně is right" });
    expect(item.status).toBe("rejected");
    expect(item.comment).toBe("Ruzyně is right");
    expect(service.update).not.toHaveBeenCalled();
  });

  it("does not approve once the shipment has moved on since the request", async () => {
    for (const over of [{ customsOffice: "CZ200000 Celní úřad v Liberci, Liberec" }, { customsProcedure: "SCP" }]) {
      shipments.getByIdForCompany.mockResolvedValueOnce(shipment(over));
      await expect(requests.decide(manager, ID, { approve: true })).rejects.toThrow("has changed since");
    }
    expect(repo.answer).not.toHaveBeenCalled();
  });

  it("does not answer twice", async () => {
    repo.get.mockResolvedValueOnce(request({ status: "approved" }));
    await expect(requests.decide(manager, ID, { approve: true })).rejects.toThrow("already been answered");
    repo.answer.mockResolvedValueOnce(null);
    await expect(requests.decide(manager, ID, { approve: true })).rejects.toThrow("already been answered");
    expect(service.update).not.toHaveBeenCalled();
  });

  it("gives the answer back when the office could not be written", async () => {
    service.update.mockRejectedValue(new Error("write failed"));
    await expect(requests.decide(manager, ID, { approve: true })).rejects.toThrow("write failed");
    expect(repo.reopen).toHaveBeenCalledWith(ID, "c1");
  });
});

describe("the answer under the bell", () => {
  it("is marked seen for the one who asked", async () => {
    await requests.markSeen(user, ID);
    expect(repo.markSeen).toHaveBeenCalledWith(ID, "c1", user.userID, expect.any(Date));
  });
});
