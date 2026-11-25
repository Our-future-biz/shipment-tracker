import { beforeEach, describe, expect, it, vi } from "vitest";

const logRepo = vi.hoisted(() => ({ noticeLinks: vi.fn() }));
const sailings = vi.hoisted(() => ({ get: vi.fn() }));
const notices = vi.hoisted(() => ({ ofKind: vi.fn(), createForShipments: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../lib/userName", () => ({ userNameOf: async () => "Jana Nová" }));
vi.mock("../../repositories/coLoadingLog.repository", () => ({ coLoadingLogRepository: logRepo }));
vi.mock("../../repositories/coLoadingSailing.repository", () => ({ coLoadingSailingRepository: sailings }));
vi.mock("../../repositories/shipmentCustomerNotice.repository", () => ({ shipmentCustomerNoticeRepository: notices }));

import { coLoadingNoticesService as service } from "../../services/coLoadingNotices.service";

// A sailing's "sailed" and "rolled" customer notices (Council Outlay 14, C6) against stand-ins for
// the database: what is refused before anything is written, and that the notices of a recording
// are written together, one on each shipment, each with its own subject.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SAILING = "22222222-2222-4222-8222-222222222222";
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const USER = { userID: "u-user", companyID: COMPANY };
const LINKED = new Date("2026-11-20T08:00:00Z");
const link = (shipmentId: string, jobNumber: string, more = {}) => ({ shipmentId, jobNumber, customer: " Alfa s.r.o. ", status: "Booked [IMP]", linkedAt: LINKED, removedAt: null as Date | null, removedReason: "", removedNote: "", movedToVessel: null as string | null, movedToVoyage: null as string | null, ...more });

beforeEach(() => {
  vi.clearAllMocks();
  sailings.get.mockResolvedValue({ id: SAILING, vessel: "MSC Anna", voyage: "445W", stage: "departed" });
  logRepo.noticeLinks.mockResolvedValue([
    link(A, "CZLCL1"),
    link(B, "CZLCL2", { removedAt: new Date("2026-11-22T08:00:00Z"), removedReason: "moved", removedNote: "Box full", movedToVessel: "WEEK 52", movedToVoyage: "" }),
  ]);
  notices.ofKind.mockResolvedValue([]);
  notices.createForShipments.mockResolvedValue(true);
});

describe("recording that a sailing's customers were told", () => {
  it("refuses \"sailed\" before the sailing is set to Departed: nothing is written", async () => {
    sailings.get.mockResolvedValue({ id: SAILING, vessel: "MSC Anna", voyage: "445W", stage: "closed" });
    await expect(service.record(SAILING, { kind: "sailed", shipmentIds: [A], channel: "email" }, USER)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "This sailing is not set to Departed yet: set its stage first.",
    });
    expect(notices.createForShipments).not.toHaveBeenCalled();
  });

  it("writes one notice on each shipment, each once, with its own subject, all in one go", async () => {
    await service.record(SAILING, { kind: "sailed", shipmentIds: [A, A], channel: "phone", note: "  Told Petr " }, USER);
    expect(notices.createForShipments).toHaveBeenCalledTimes(1);
    expect(notices.createForShipments).toHaveBeenCalledWith(COMPANY, [{ shipmentId: A, kind: "sailed", channel: "phone", toldTo: "Alfa s.r.o.", subject: "Sailed on MSC Anna 445W", note: "Told Petr", toldById: "u-user" }]);
  });

  it("names where a rolled shipment went and why", async () => {
    await service.record(SAILING, { kind: "rolled", shipmentIds: [B], channel: "email" }, USER);
    expect(notices.createForShipments).toHaveBeenCalledWith(COMPANY, [expect.objectContaining({ shipmentId: B, kind: "rolled", subject: "Rolled from MSC Anna 445W to WEEK 52: Box full" })]);
  });

  it("refuses a shipment that is not on that list, a kind or a way that is none, and a long note: nothing is written", async () => {
    await expect(service.record(SAILING, { kind: "sailed", shipmentIds: [B], channel: "email" }, USER)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.record(SAILING, { kind: "lost", shipmentIds: [A], channel: "email" }, USER)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.record(SAILING, { kind: "sailed", shipmentIds: [A], channel: "pigeon" }, USER)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.record(SAILING, { kind: "sailed", shipmentIds: [A], channel: "email", note: "x".repeat(501) }, USER)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(notices.createForShipments).not.toHaveBeenCalled();
  });

  it("records none when a shipment is gone by the time they are written, and says so", async () => {
    notices.createForShipments.mockResolvedValue(false);
    await expect(service.record(SAILING, { kind: "sailed", shipmentIds: [A], channel: "email" }, USER)).rejects.toMatchObject({ code: "not_found", message: "A ticked shipment was not found: nothing was recorded. Read the list again." });
  });

  it("is not found for another company's sailing", async () => {
    sailings.get.mockResolvedValue(null);
    await expect(service.record(SAILING, { kind: "sailed", shipmentIds: [A], channel: "email" }, USER)).rejects.toMatchObject({ code: "not_found" });
  });
});
