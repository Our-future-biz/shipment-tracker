import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => {
  class NoteChangedMeanwhile extends Error {
    constructor(readonly by: string) {
      super("note changed meanwhile");
    }
  }
  return { NoteChangedMeanwhile, repo: { ticks: vi.fn(), setTick: vi.fn(), setNote: vi.fn(), sailingChanges: vi.fn(), historyLinks: vi.fn() } };
});
const sailings = vi.hoisted(() => ({ get: vi.fn() }));
const settings = vi.hoisted(() => ({ get: vi.fn() }));
const services = vi.hoisted(() => ({ get: vi.fn(), requireOpen: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../lib/userName", () => ({ userNameOf: async () => "Jana Nová" }));
vi.mock("../../repositories/coLoadingLog.repository", () => ({ coLoadingLogRepository: log.repo, NoteChangedMeanwhile: log.NoteChangedMeanwhile }));
vi.mock("../../repositories/coLoadingSailing.repository", () => ({ coLoadingSailingRepository: sailings }));
vi.mock("../../repositories/coLoadingSetting.repository", () => ({ coLoadingSettingRepository: settings }));
vi.mock("../../services/coLoadingService.service", () => ({ coLoadingServiceService: services }));

import { coLoadingLogService as service } from "../../services/coLoadingLog.service";

// A sailing's checklist and hand-over note (Council Outlay 14, C5) against stand-ins for the
// database: what is refused before anything is written, the words a tick is kept by, and a note
// a colleague changed meanwhile, which is not written over unseen.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SAILING = "22222222-2222-4222-8222-222222222222";
const USER = { userID: "u-user", companyID: COMPANY };
const BY = { id: "u-user", name: "Jana Nová" };
const sailing = (more = {}) => ({ id: SAILING, serviceId: "svc", note: "", noteByName: "", noteAt: null, createdAt: new Date("2026-11-20T08:00:00Z"), createdByName: "Jan", ...more });

beforeEach(() => {
  vi.clearAllMocks();
  sailings.get.mockResolvedValue(sailing());
  settings.get.mockResolvedValue(null);
  services.get.mockResolvedValue({ id: "svc", direction: "import" });
  services.requireOpen.mockResolvedValue({ id: "svc" });
  log.repo.ticks.mockResolvedValue([]);
  log.repo.sailingChanges.mockResolvedValue([]);
  log.repo.historyLinks.mockResolvedValue([]);
  log.repo.setTick.mockResolvedValue(true);
  log.repo.setNote.mockResolvedValue(sailing());
});

describe("ticking a step of a sailing's checklist", () => {
  it("ticks it by the list's own words, whatever the case typed, as the one who ticks", async () => {
    await service.setTick(SAILING, "  b/l RECEIVED ", true, USER);
    expect(log.repo.setTick).toHaveBeenCalledWith(SAILING, COMPANY, "B/L received", true, BY);
  });

  it("unticks a step no longer on the list, and refuses to tick one", async () => {
    log.repo.ticks.mockResolvedValue([{ step: "Customs cleared", doneByName: "Eva", doneAt: new Date("2026-11-21T08:00:00Z") }]);
    await service.setTick(SAILING, "customs cleared", false, USER);
    expect(log.repo.setTick).toHaveBeenCalledWith(SAILING, COMPANY, "Customs cleared", false, BY);
    await expect(service.setTick(SAILING, "Customs cleared", true, USER)).rejects.toMatchObject({ code: "invalid_argument", message: "This step is no longer on the checklist: it can only be unticked." });
    await expect(service.setTick(SAILING, "Fumigation", true, USER)).rejects.toMatchObject({ code: "invalid_argument", message: "This step is not on the sailing's checklist." });
    expect(log.repo.setTick).toHaveBeenCalledTimes(1);
  });

  it("answers the checklist as it is when the step already stood that way", async () => {
    log.repo.setTick.mockResolvedValue(false);
    expect((await service.setTick(SAILING, "Pre-alert", false, USER)).checklist).toHaveLength(6);
  });

  it("is refused on a closed service, and not found for another company's sailing: nothing is written", async () => {
    services.requireOpen.mockRejectedValue(Object.assign(new Error("closed"), { code: "failed_precondition" }));
    await expect(service.setTick(SAILING, "Pre-alert", true, USER)).rejects.toMatchObject({ code: "failed_precondition" });
    sailings.get.mockResolvedValue(null);
    await expect(service.setTick(SAILING, "Pre-alert", true, USER)).rejects.toMatchObject({ code: "not_found" });
    expect(log.repo.setTick).not.toHaveBeenCalled();
  });
});

describe("the hand-over note", () => {
  it("is kept trimmed, as the one who writes it, with the note the screen showed", async () => {
    await service.setNote(SAILING, "  Call the warehouse before Friday \n", " Old note ", USER);
    expect(log.repo.setNote).toHaveBeenCalledWith(SAILING, COMPANY, "Call the warehouse before Friday", "Old note", BY);
    await service.setNote(SAILING, "", null, USER);
    expect(log.repo.setNote).toHaveBeenLastCalledWith(SAILING, COMPANY, "", null, BY);
  });

  it("is refused longer than 2,000 characters, and on a closed service: nothing is written", async () => {
    await expect(service.setNote(SAILING, "x".repeat(2001), null, USER)).rejects.toMatchObject({ code: "invalid_argument", message: "Keep the note to 2,000 characters." });
    services.requireOpen.mockRejectedValue(Object.assign(new Error("closed"), { code: "failed_precondition" }));
    await expect(service.setNote(SAILING, "x", null, USER)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(log.repo.setNote).not.toHaveBeenCalled();
  });

  it("is refused, naming who, when a colleague changed it since the screen read it", async () => {
    log.repo.setNote.mockRejectedValue(new log.NoteChangedMeanwhile("Eva Malá"));
    await expect(service.setNote(SAILING, "Mine", "Before", USER)).rejects.toMatchObject({
      code: "aborted",
      message: "The hand-over note was changed meanwhile by Eva Malá. Nothing was saved: read the note again, then write yours.",
    });
  });

  it("is not found for another company's sailing, nor one gone by the time it is locked", async () => {
    log.repo.setNote.mockResolvedValue(null);
    await expect(service.setNote(SAILING, "x", null, USER)).rejects.toMatchObject({ code: "not_found" });
    sailings.get.mockResolvedValue(null);
    await expect(service.setNote(SAILING, "x", null, USER)).rejects.toMatchObject({ code: "not_found" });
  });
});
