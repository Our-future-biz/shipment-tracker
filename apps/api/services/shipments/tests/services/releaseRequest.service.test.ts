import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  latestForShipment: vi.fn(),
  listForManagers: vi.fn(),
  listForUser: vi.fn(),
  answersFor: vi.fn(),
  answer: vi.fn(),
  usablePass: vi.fn(),
  markSeen: vi.fn(),
  withdraw: vi.fn(),
}));
const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const service = vi.hoisted(() => ({ update: vi.fn(), releaseHouseBol: vi.fn(), mayChangeDetails: vi.fn(), prepaymentRefusal: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  auth: { userLookup: vi.fn(async ({ ids }: { ids: string[] }) => ({ users: [{ id: ids[0], name: ids[0] === "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c02" ? "Eva Malá" : "Jan Novák" }] })) },
}));
vi.mock("../../repositories/shipmentReleaseRequest.repository", () => ({ shipmentReleaseRequestRepository: repo }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: service }));

import { auth } from "~encore/clients";
import { releaseRequestService as requests } from "../../services/releaseRequest.service";

// "Ask a manager to release", against stand-ins for its repository and for the shipment service:
// who may ask and for what, who may answer (four eyes), and that an answer - approved too - releases
// NOTHING: the approved request is a pass the release itself uses (tests/services/shipment.service.test.ts).
// The rules are tests/releaseRequest.test.ts.

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const ID = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const user = { userID: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c01", companyID: "c1", role: "user" };
const manager = { userID: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c02", companyID: "c1", role: "manager" };
const STOP = "The House BoL can't be released: the job is on prepayment and not paid - an invoice is left to pay. A manager can release it with a reason";
// Wednesday 18 Nov 2026, 23:30 in Prague is still the 18th there, the 18th in UTC too.
const NOW = new Date("2026-11-18T22:30:00Z");

const shipment = (over = {}) => ({
  id: SHIPMENT,
  jobNumber: "CZFCL00000001",
  customer: "Alza",
  personInCharge: "jan@firma.cz",
  holidayCover: "",
  houseBolRelease: "",
  warehouseReceivedDate: "2026-11-10",
  warehouseReleasedDate: null,
  ...over,
});
const request = (over = {}) => ({
  id: ID,
  companyId: "c1",
  shipmentId: SHIPMENT,
  jobNumber: "CZFCL00000001",
  customer: "Alza",
  what: "house_bol",
  reason: "Customer pays on Friday",
  status: "pending",
  requestedById: user.userID,
  requestedByName: "Jan Novák",
  requestedAt: new Date("2026-11-18T10:00:00Z"),
  decidedById: null,
  decidedByName: "",
  decidedAt: null,
  comment: "",
  answerSeenAt: null,
  usedAt: null,
  usedById: null,
  usedByName: "",
  closedAt: null,
  closedWhy: null,
  closedById: null,
  closedByName: "",
  closeReason: "",
  updatedAt: new Date("2026-11-18T10:00:00Z"),
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  shipments.getByIdForCompany.mockResolvedValue(shipment());
  service.mayChangeDetails.mockResolvedValue(true);
  service.prepaymentRefusal.mockResolvedValue(STOP);
  repo.usablePass.mockResolvedValue(null);
  repo.create.mockImplementation(async (values) => request(values));
  repo.get.mockResolvedValue(request());
  repo.answer.mockImplementation(async (_id, _company, answer) => request(answer));
});

describe("asking a manager to release", () => {
  it("records what is asked, the reason and who asked, with a line in the job's history - and releases nothing", async () => {
    const item = await requests.ask(user, SHIPMENT, { what: "house_bol", reason: " Customer pays on Friday " });
    expect(repo.create).toHaveBeenCalledWith(
      { companyId: "c1", shipmentId: SHIPMENT, what: "house_bol", reason: "Customer pays on Friday", requestedById: user.userID, requestedByName: "Jan Novák" },
      { userId: user.userID, field: "releaseRequest", oldValue: null, newValue: "House BoL release asked: Customer pays on Friday" },
    );
    expect(item).toMatchObject({ status: "pending", what: "house_bol", jobNumber: "CZFCL00000001", customer: "Alza", usable: false, validUntil: null, usedAt: null, usedByName: "", closedAt: null });
    expect(service.prepaymentRefusal).toHaveBeenCalledWith(SHIPMENT, "house_bol");
    expect(service.releaseHouseBol).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it("asks the stop about the warehouse's release by its own name", async () => {
    await requests.ask(user, SHIPMENT, { what: "warehouse", reason: "Truck is waiting" });
    expect(service.prepaymentRefusal).toHaveBeenCalledWith(SHIPMENT, "warehouse_released");
    expect(repo.create.mock.lastCall![1]).toMatchObject({ newValue: "Warehouse Released asked: Truck is waiting" });
  });

  it("is, for the House BoL, for whoever may release it: the job's Handled By or Holiday Cover, or a manager (the edit rule)", async () => {
    service.mayChangeDetails.mockResolvedValue(false);
    await expect(requests.ask(user, SHIPMENT, { what: "house_bol", reason: "Customer pays on Friday" })).rejects.toMatchObject({
      code: "permission_denied",
      message: "Only the user in this shipment's Handled By or Holiday Cover, or a manager, can change its details",
    });
    expect(service.mayChangeDetails).toHaveBeenCalledWith(expect.objectContaining({ personInCharge: "jan@firma.cz" }), user.userID, "user");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("is, for Warehouse Released, for anyone of the company: the field is the warehouse's", async () => {
    service.mayChangeDetails.mockResolvedValue(false);
    await expect(requests.ask(user, SHIPMENT, { what: "warehouse", reason: "Truck is waiting" })).resolves.toMatchObject({ status: "pending" });
    expect(service.mayChangeDetails).not.toHaveBeenCalled();
  });

  it("wants one of the two things and a reason", async () => {
    await expect(requests.ask(user, SHIPMENT, { what: "mbl", reason: "Customer pays on Friday" })).rejects.toMatchObject({ code: "invalid_argument", message: "what must be one of house_bol, warehouse" });
    await expect(requests.ask(user, SHIPMENT, { what: "house_bol", reason: " ab " })).rejects.toThrow("Say why the job should be released before it is paid");
    await expect(requests.ask(user, SHIPMENT, { what: "house_bol", reason: "x".repeat(501) })).rejects.toThrow("too long");
    expect(shipments.getByIdForCompany).not.toHaveBeenCalled();
  });

  it("finds no shipment of another company, a deleted one, or what is no id", async () => {
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(requests.ask(user, SHIPMENT, { what: "house_bol", reason: "Customer pays on Friday" })).rejects.toMatchObject({ code: "not_found" });
    shipments.getByIdForCompany.mockClear();
    await expect(requests.ask(user, "s1", { what: "house_bol", reason: "Customer pays on Friday" })).rejects.toMatchObject({ code: "not_found" });
    expect(shipments.getByIdForCompany).not.toHaveBeenCalled();
  });

  it("is refused when there is nothing left to release, without asking Invoicing", async () => {
    shipments.getByIdForCompany.mockResolvedValue(shipment({ houseBolRelease: "eva@firma.cz — 18. 11. 2026 9:15:00" }));
    await expect(requests.ask(user, SHIPMENT, { what: "house_bol", reason: "Customer pays on Friday" })).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("already released") });
    shipments.getByIdForCompany.mockResolvedValue(shipment({ warehouseReleasedDate: "2026-11-17" }));
    await expect(requests.ask(user, SHIPMENT, { what: "warehouse", reason: "Truck is waiting" })).rejects.toThrow("Warehouse Released is already set (2026-11-17)");
    shipments.getByIdForCompany.mockResolvedValue(shipment({ warehouseReceivedDate: null }));
    await expect(requests.ask(user, SHIPMENT, { what: "warehouse", reason: "Truck is waiting" })).rejects.toThrow("not received in the warehouse yet");
    expect(service.prepaymentRefusal).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("is refused for a job the prepayment stop does not hold: it needs no manager", async () => {
    service.prepaymentRefusal.mockResolvedValue(null);
    await expect(requests.ask(user, SHIPMENT, { what: "house_bol", reason: "Customer pays on Friday" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "This job is not held for payment: it can be released without a manager",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("is refused while an approved request can still be used: the release is to be made, not asked for again", async () => {
    repo.usablePass.mockResolvedValue(request({ status: "approved", decidedAt: new Date("2026-11-17T09:00:00Z"), decidedByName: "Eva Malá", comment: "Fine" }));
    await expect(requests.ask(user, SHIPMENT, { what: "house_bol", reason: "Customer pays on Friday" }, NOW)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "A release was already approved for this job: release it now (valid until 24.11.)",
    });
    // Asked of the same thing, bound to what a pass is good for.
    expect(repo.usablePass).toHaveBeenCalledWith("c1", SHIPMENT, "house_bol", new Date(NOW.getTime() - 7 * 86_400_000));
    expect(service.prepaymentRefusal).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("may be asked again once the approval was used or has run out, and after a rejection: no usable one, none waiting", async () => {
    repo.usablePass.mockResolvedValue(null);
    await expect(requests.ask(user, SHIPMENT, { what: "house_bol", reason: "Customer pays on Friday" }, NOW)).resolves.toMatchObject({ status: "pending" });
  });

  it("is refused, to be tried again, when who asks can't be looked up: no request is kept without the asker's name", async () => {
    vi.mocked(auth.userLookup).mockRejectedValueOnce(new Error("auth is unreachable"));
    await expect(requests.ask(user, SHIPMENT, { what: "house_bol", reason: "Customer pays on Friday" })).rejects.toMatchObject({
      code: "unavailable",
      message: "Who you are could not be read just now — try again in a moment",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses a second request while one waits for the same thing", async () => {
    repo.create.mockResolvedValue(null);
    await expect(requests.ask(user, SHIPMENT, { what: "house_bol", reason: "Customer pays on Friday" })).rejects.toMatchObject({
      code: "already_exists",
      message: "A request for this release is already waiting for a manager",
    });
  });
});

describe("the lists", () => {
  it("give a manager everything waiting and the last 30 days' answers, anyone else their own", async () => {
    repo.listForManagers.mockResolvedValue([request()]);
    repo.listForUser.mockResolvedValue([request({ status: "rejected" })]);
    expect(await requests.list(manager, NOW)).toMatchObject([{ id: ID, status: "pending" }]);
    expect(repo.listForManagers).toHaveBeenCalledWith("c1", expect.any(Date), 200);
    expect(repo.listForUser).not.toHaveBeenCalled();
    const since = repo.listForManagers.mock.lastCall![1] as Date;
    expect(NOW.getTime() - since.getTime()).toBe(30 * 86_400_000);

    expect(await requests.list(user, NOW)).toMatchObject([{ status: "rejected" }]);
    expect(repo.listForUser).toHaveBeenCalledWith("c1", user.userID, expect.any(Date), 200);
    expect(repo.listForManagers).toHaveBeenCalledTimes(1);
  });

  it("give a shipment's newest request of each thing, and nothing for what is no id", async () => {
    repo.latestForShipment.mockResolvedValue([request(), request({ what: "warehouse" })]);
    expect((await requests.latest(user, SHIPMENT)).map((r) => r.what)).toEqual(["house_bol", "warehouse"]);
    expect(await requests.latest(user, "s1")).toEqual([]);
    expect(repo.latestForShipment).toHaveBeenCalledTimes(1);
  });
});

describe("what a request says about itself", () => {
  const decidedAt = new Date("2026-11-17T09:00:00Z");
  const approved = (over = {}) => request({ status: "approved", decidedById: manager.userID, decidedByName: "Eva Malá", decidedAt, comment: "Fine", ...over });

  it("approved: until when it can be used, and that it can be - until it is used or has run out", async () => {
    repo.latestForShipment.mockResolvedValue([approved()]);
    expect((await requests.latest(user, SHIPMENT, NOW))[0]).toMatchObject({ status: "approved", usable: true, validUntil: "2026-11-24T09:00:00.000Z", usedAt: null, usedByName: "", closedAt: null });
    expect((await requests.latest(user, SHIPMENT, new Date("2026-11-24T09:00:01Z")))[0]).toMatchObject({ usable: false, validUntil: "2026-11-24T09:00:00.000Z" });
    repo.latestForShipment.mockResolvedValue([approved({ usedAt: new Date("2026-11-18T08:00:00Z"), usedById: user.userID, usedByName: "jan@firma.cz" })]);
    expect((await requests.latest(user, SHIPMENT, NOW))[0]).toMatchObject({ usable: false, usedAt: "2026-11-18T08:00:00.000Z", usedByName: "jan@firma.cz", validUntil: "2026-11-24T09:00:00.000Z" });
  });

  it("closed: nobody answered it - released without it, and when", async () => {
    const closedAt = new Date("2026-11-18T12:00:00Z");
    repo.listForManagers.mockResolvedValue([request({ status: "closed", closedAt, closedWhy: "released", updatedAt: new Date("2026-11-18T12:30:00Z") })]);
    expect((await requests.list(manager, NOW))[0]).toMatchObject({
      status: "closed",
      closedWhy: "released",
      comment: "",
      decidedByName: "",
      decidedAt: null,
      closedAt: "2026-11-18T12:00:00.000Z",
      closedByName: "",
      closeReason: "",
      usable: false,
      validUntil: null,
    });
    // A row closed before the closing had its own fields: by a release, dated by its last write.
    repo.listForManagers.mockResolvedValue([request({ status: "closed", updatedAt: closedAt })]);
    expect((await requests.list(manager, NOW))[0]).toMatchObject({ closedWhy: "released", closedAt: "2026-11-18T12:00:00.000Z" });
  });

  it("closed after it was approved, unused: not usable any more, still naming who approved it, when and why (m19)", async () => {
    repo.latestForShipment.mockResolvedValue([approved({ status: "closed", closedAt: new Date("2026-11-18T12:00:00Z"), closedWhy: "released" })]);
    expect((await requests.latest(user, SHIPMENT, NOW))[0]).toMatchObject({
      status: "closed",
      closedWhy: "released",
      // The manager's reason, not words of the app written over it.
      comment: "Fine",
      decidedByName: "Eva Malá",
      decidedAt: "2026-11-17T09:00:00.000Z",
      closedAt: "2026-11-18T12:00:00.000Z",
      usable: false,
      validUntil: null,
      usedAt: null,
    });
  });

  it("withdrawn: by whom and why, the manager's own answer kept", async () => {
    repo.latestForShipment.mockResolvedValue([
      approved({ status: "closed", closedAt: new Date("2026-11-18T12:00:00Z"), closedWhy: "withdrawn", closedById: manager.userID, closedByName: "Eva Malá", closeReason: "Customer cancelled" }),
    ]);
    expect((await requests.latest(user, SHIPMENT, NOW))[0]).toMatchObject({ status: "closed", closedWhy: "withdrawn", closedByName: "Eva Malá", closeReason: "Customer cancelled", comment: "Fine", usable: false });
  });

  it("pending and rejected: nothing to use", async () => {
    repo.listForUser.mockResolvedValue([request(), request({ status: "rejected", decidedAt, decidedByName: "Eva Malá", comment: "No" })]);
    for (const item of await requests.list(user, NOW)) expect(item).toMatchObject({ usable: false, validUntil: null, closedAt: null });
  });
});

describe("answering a request", () => {
  it("is for managers only", async () => {
    await expect(requests.decide(user, ID, { approve: true, comment: "It is fine" })).rejects.toMatchObject({ code: "permission_denied", message: "Only a manager answers these requests" });
    expect(repo.get).not.toHaveBeenCalled();
    expect(repo.answer).not.toHaveBeenCalled();
  });

  it("is never for the one who asked, a manager neither: four eyes", async () => {
    repo.get.mockResolvedValue(request({ requestedById: manager.userID }));
    for (const approve of [true, false]) {
      await expect(requests.decide(manager, ID, { approve, comment: "It is fine" })).rejects.toMatchObject({
        code: "permission_denied",
        message: "You asked for this release yourself: another manager decides it",
      });
    }
    expect(repo.answer).not.toHaveBeenCalled();
  });

  it("wants the manager's reason either way: approving without one is refused as rejecting without one is", async () => {
    for (const comment of [undefined, "", "  ", "ok"]) {
      await expect(requests.decide(manager, ID, { approve: true, comment })).rejects.toMatchObject({ code: "invalid_argument", message: "Say why the job may be released before it is paid" });
      await expect(requests.decide(manager, ID, { approve: false, comment })).rejects.toMatchObject({ code: "invalid_argument", message: "Say why the request is rejected" });
    }
    await expect(requests.decide(manager, ID, { approve: true, comment: "x".repeat(501) })).rejects.toThrow("The comment is too long");
    expect(repo.get).not.toHaveBeenCalled();
    expect(repo.answer).not.toHaveBeenCalled();
  });

  it("approved, records the answer with its line in the job's history - and releases NOTHING: the request is now a pass, good for 7 days", async () => {
    const item = await requests.decide(manager, ID, { approve: true, comment: " Agreed with the owner " }, NOW);
    expect(repo.answer).toHaveBeenCalledTimes(1);
    expect(repo.answer).toHaveBeenCalledWith(
      ID,
      "c1",
      { status: "approved", decidedById: manager.userID, decidedByName: "Eva Malá", decidedAt: NOW, comment: "Agreed with the owner" },
      { userId: manager.userID, field: "releaseRequest", oldValue: null, newValue: "House BoL release approved (asked by Jan Novák): Agreed with the owner" },
    );
    expect(item).toMatchObject({
      status: "approved",
      decidedByName: "Eva Malá",
      comment: "Agreed with the owner",
      usable: true,
      validUntil: new Date(NOW.getTime() + 7 * 86_400_000).toISOString(),
      usedAt: null,
    });
    expect(service.releaseHouseBol).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it("approved for the warehouse, sets no Warehouse Released: the warehouse releases, with its truck and its day", async () => {
    repo.get.mockResolvedValue(request({ what: "warehouse", reason: "Truck is waiting" }));
    repo.answer.mockImplementation(async (_id, _company, answer) => request({ what: "warehouse", ...answer }));
    await expect(requests.decide(manager, ID, { approve: true, comment: "Agreed with the owner" }, NOW)).resolves.toMatchObject({ status: "approved", what: "warehouse", usable: true });
    expect(repo.answer.mock.lastCall![3]).toMatchObject({ newValue: "Warehouse Released approved (asked by Jan Novák): Agreed with the owner" });
    expect(service.update).not.toHaveBeenCalled();
    expect(service.releaseHouseBol).not.toHaveBeenCalled();
  });

  it("does not approve a request whose release was made meanwhile, or can't be made: the manager is told to reject it, and nothing is answered", async () => {
    shipments.getByIdForCompany.mockResolvedValue(shipment({ houseBolRelease: "eva@firma.cz — 18. 11. 2026 9:15:00" }));
    await expect(requests.decide(manager, ID, { approve: true, comment: "It is fine" }, NOW)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "The House BoL was already released (eva@firma.cz — 18. 11. 2026 9:15:00): reject the request instead",
    });
    repo.get.mockResolvedValue(request({ what: "warehouse" }));
    shipments.getByIdForCompany.mockResolvedValue(shipment({ warehouseReceivedDate: null }));
    await expect(requests.decide(manager, ID, { approve: true, comment: "It is fine" }, NOW)).rejects.toThrow("The cargo was not received in the warehouse yet: fill in Warehouse Received first: reject the request instead");
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(requests.decide(manager, ID, { approve: true, comment: "It is fine" }, NOW)).rejects.toMatchObject({ code: "not_found" });
    expect(repo.answer).not.toHaveBeenCalled();
    // Rejecting it needs no look at the shipment.
    shipments.getByIdForCompany.mockClear();
    await expect(requests.decide(manager, ID, { approve: false, comment: "Released already" }, NOW)).resolves.toMatchObject({ status: "rejected" });
    expect(shipments.getByIdForCompany).not.toHaveBeenCalled();
  });

  it("rejected, writes the answer with its history line in one go", async () => {
    const item = await requests.decide(manager, ID, { approve: false, comment: "Not before the payment" }, NOW);
    expect(item).toMatchObject({ status: "rejected", comment: "Not before the payment", usable: false, validUntil: null });
    expect(repo.answer).toHaveBeenCalledWith(
      ID,
      "c1",
      { status: "rejected", decidedById: manager.userID, decidedByName: "Eva Malá", decidedAt: NOW, comment: "Not before the payment" },
      { userId: manager.userID, field: "releaseRequest", oldValue: null, newValue: "House BoL release rejected (asked by Jan Novák): Not before the payment" },
    );
  });

  it("is refused, to be tried again, when the manager can't be looked up: no answer - nor the override reason it gives - is kept without their name", async () => {
    vi.mocked(auth.userLookup).mockRejectedValueOnce(new Error("auth is unreachable"));
    await expect(requests.decide(manager, ID, { approve: true, comment: "Agreed with the owner" }, NOW)).rejects.toMatchObject({
      code: "unavailable",
      message: "Who you are could not be read just now — try again in a moment",
    });
    expect(repo.answer).not.toHaveBeenCalled();
  });

  it("is given once: an answered or closed request, and one answered by another manager meanwhile, are refused", async () => {
    for (const status of ["approved", "rejected", "closed"]) {
      repo.get.mockResolvedValue(request({ status }));
      await expect(requests.decide(manager, ID, { approve: true, comment: "It is fine" })).rejects.toMatchObject({ code: "failed_precondition", message: "This request has already been answered" });
    }
    expect(repo.answer).not.toHaveBeenCalled();
    repo.get.mockResolvedValue(request());
    repo.answer.mockResolvedValue(null);
    await expect(requests.decide(manager, ID, { approve: true, comment: "It is fine" })).rejects.toThrow("This request has already been answered");
  });

  it("finds no request of another company, and none for what is no id", async () => {
    repo.get.mockResolvedValue(null);
    await expect(requests.decide(manager, ID, { approve: true, comment: "It is fine" })).rejects.toMatchObject({ code: "not_found" });
    repo.get.mockClear();
    await expect(requests.decide(manager, "r1", { approve: true, comment: "It is fine" })).rejects.toMatchObject({ code: "not_found" });
    expect(repo.get).not.toHaveBeenCalled();
  });
});

describe("withdrawing (K20)", () => {
  const approved = (over = {}) => request({ status: "approved", decidedById: manager.userID, decidedByName: "Eva Malá", decidedAt: new Date("2026-11-17T09:00:00Z"), comment: "Fine", ...over });
  beforeEach(() => {
    repo.withdraw.mockImplementation(async (_id, _company, _kind, by) => request({ status: "closed", closedAt: by.at, closedWhy: "withdrawn", closedById: by.id, closedByName: by.name, closeReason: by.reason }));
  });

  it("lets whoever asked take back their request while it waits, with a reason and a line in the job's history", async () => {
    const item = await requests.withdraw(user, ID, { reason: " Paid meanwhile " }, NOW);
    expect(repo.withdraw).toHaveBeenCalledExactlyOnceWith(
      ID,
      "c1",
      "request",
      { id: user.userID, name: "Jan Novák", reason: "Paid meanwhile", at: NOW },
      { userId: user.userID, field: "releaseRequest", oldValue: null, newValue: "House BoL release request withdrawn: Paid meanwhile" },
    );
    expect(item).toMatchObject({ status: "closed", closedWhy: "withdrawn", closedByName: "Jan Novák", closeReason: "Paid meanwhile", usable: false });
  });

  it("lets a manager take back an approval nobody used - it lets nothing through any more", async () => {
    repo.get.mockResolvedValue(approved());
    await requests.withdraw(manager, ID, { reason: "Customer cancelled" }, NOW);
    expect(repo.withdraw).toHaveBeenCalledWith(ID, "c1", "approval", expect.objectContaining({ id: manager.userID, name: "Eva Malá" }), expect.objectContaining({ newValue: "House BoL release approval withdrawn (asked by Jan Novák): Customer cancelled" }));
  });

  it("refuses somebody else's waiting request, a user's take on an approval, and a used approval - nothing is written", async () => {
    await expect(requests.withdraw(manager, ID, { reason: "Not needed" }, NOW)).rejects.toMatchObject({ code: "permission_denied" });
    repo.get.mockResolvedValue(approved());
    await expect(requests.withdraw(user, ID, { reason: "Not needed" }, NOW)).rejects.toMatchObject({ code: "permission_denied", message: "Only a manager can withdraw an approval" });
    repo.get.mockResolvedValue(approved({ usedAt: NOW, usedByName: "jan@firma.cz" }));
    await expect(requests.withdraw(manager, ID, { reason: "Not needed" }, NOW)).rejects.toMatchObject({ code: "failed_precondition" });
    for (const status of ["rejected", "closed"]) {
      repo.get.mockResolvedValue(request({ status }));
      await expect(requests.withdraw(user, ID, { reason: "Not needed" }, NOW)).rejects.toMatchObject({ code: "failed_precondition" });
    }
    expect(repo.withdraw).not.toHaveBeenCalled();
  });

  it("wants a reason, finds no request of another company, and says so when it was answered or used meanwhile", async () => {
    await expect(requests.withdraw(user, ID, { reason: " x " }, NOW)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(requests.withdraw(user, ID, { reason: "y".repeat(501) }, NOW)).rejects.toMatchObject({ code: "invalid_argument" });
    repo.get.mockResolvedValue(null);
    await expect(requests.withdraw(user, ID, { reason: "Paid meanwhile" }, NOW)).rejects.toMatchObject({ code: "not_found" });
    repo.get.mockResolvedValue(request());
    repo.withdraw.mockResolvedValue(null);
    await expect(requests.withdraw(user, ID, { reason: "Paid meanwhile" }, NOW)).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("the answers under the asker's bell", () => {
  it("are the user's own, not opened yet or opened in the last 7 days - an approval says whether it can still be used", async () => {
    repo.answersFor.mockResolvedValue([request({ status: "approved", decidedAt: NOW, decidedByName: "Eva Malá", comment: "Fine" }), request({ status: "rejected", decidedAt: NOW, decidedByName: "Eva Malá", comment: "No" })]);
    // The day is passed in: an approval is good for 7 days from NOW, whatever the clock says when the test runs.
    expect(await requests.myAnswers(user, NOW)).toMatchObject([
      { status: "approved", decidedByName: "Eva Malá", answerSeenAt: null, usable: true },
      { status: "rejected", usable: false },
    ]);
    expect(repo.answersFor).toHaveBeenCalledWith("c1", user.userID, expect.any(Date), 200);
    const seenSince = repo.answersFor.mock.lastCall![2] as Date;
    expect(NOW.getTime() - seenSince.getTime()).toBe(7 * 86_400_000);
  });

  it("are marked seen by the one who asked; what is no id is left alone", async () => {
    await requests.markSeen(user, ID);
    expect(repo.markSeen).toHaveBeenCalledWith(ID, "c1", user.userID, expect.any(Date));
    await requests.markSeen(user, "r1");
    expect(repo.markSeen).toHaveBeenCalledTimes(1);
  });
});
