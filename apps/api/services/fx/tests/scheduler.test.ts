import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ latest: "2026-10-13" as string | null }));
const mocks = vi.hoisted(() => ({
  syncNow: vi.fn(),
  ensureFresh: vi.fn(),
  raiseMissingFixing: vi.fn(),
}));

vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../repositories/cnbRate.repository", () => ({
  cnbRateRepository: { latestValidDate: vi.fn(async () => state.latest) },
}));
vi.mock("../services/fxImport.service", () => ({ syncNow: mocks.syncNow, ensureFresh: mocks.ensureFresh }));
vi.mock("../services/fxAlert.service", () => ({ raiseMissingFixing: mocks.raiseMissingFixing }));

import { pullTick } from "../services/fxScheduler";

// Wed 14 Oct 2026, Prague is UTC+2 (summer time): 15:00 Prague = 13:00Z.
const at = (hhmmZ: string, day = "2026-10-14") => new Date(`${day}T${hhmmZ}:00Z`);

beforeEach(() => {
  vi.clearAllMocks();
  state.latest = "2026-10-13";
});

describe("pullTick", () => {
  it("does nothing before 15:00 Prague", async () => {
    await pullTick(at("12:59"));
    expect(mocks.syncNow).not.toHaveBeenCalled();
  });

  it("pulls at 15:00, retries at 15:30 and 16:00, then reports the missing fixing once", async () => {
    mocks.syncNow.mockResolvedValue({ skipped: false, status: "no_new_data", latestValidDate: "2026-10-13" });
    await pullTick(at("13:00"));
    await pullTick(at("13:01")); // same slot: no second pull
    expect(mocks.syncNow).toHaveBeenCalledTimes(1);
    expect(mocks.raiseMissingFixing).not.toHaveBeenCalled();

    await pullTick(at("13:30"));
    expect(mocks.syncNow).toHaveBeenCalledTimes(2);
    expect(mocks.raiseMissingFixing).not.toHaveBeenCalled();

    await pullTick(at("14:00")); // 16:00 Prague, still missing
    expect(mocks.syncNow).toHaveBeenCalledTimes(3);
    expect(mocks.raiseMissingFixing).toHaveBeenCalledTimes(1);
    expect(mocks.raiseMissingFixing).toHaveBeenCalledWith("2026-10-14", expect.stringContaining("had not published"));

    await pullTick(at("14:05"));
    expect(mocks.syncNow).toHaveBeenCalledTimes(3);
  });

  it("reports the import error when the last pull fails", async () => {
    mocks.syncNow.mockResolvedValue({ skipped: false, status: "failed", error: "ČNB answered 503" });
    await pullTick(at("14:00", "2026-10-15"));
    expect(mocks.raiseMissingFixing).toHaveBeenCalledWith("2026-10-15", "The import failed: ČNB answered 503");
  });

  it("stops once today's fixing is stored", async () => {
    mocks.syncNow.mockImplementation(async () => {
      state.latest = "2026-10-16";
      return { skipped: false, status: "ok", latestValidDate: "2026-10-16" };
    });
    await pullTick(at("13:00", "2026-10-16"));
    await pullTick(at("13:30", "2026-10-16"));
    await pullTick(at("14:00", "2026-10-16"));
    expect(mocks.syncNow).toHaveBeenCalledTimes(1);
    expect(mocks.raiseMissingFixing).not.toHaveBeenCalled();
  });

  it("started late, runs one pull for every due slot and reports straight away", async () => {
    mocks.syncNow.mockResolvedValue({ skipped: false, status: "no_new_data", latestValidDate: "2026-10-19" });
    state.latest = "2026-10-19";
    await pullTick(at("15:00", "2026-10-20")); // 17:00 Prague
    expect(mocks.syncNow).toHaveBeenCalledTimes(1);
    expect(mocks.raiseMissingFixing).toHaveBeenCalledTimes(1);
  });

  it("skips weekends and Czech public holidays", async () => {
    await pullTick(at("14:00", "2026-10-17")); // Saturday
    await pullTick(at("14:00", "2026-10-28")); // Independence Day
    expect(mocks.syncNow).not.toHaveBeenCalled();
    expect(mocks.raiseMissingFixing).not.toHaveBeenCalled();
  });
});
