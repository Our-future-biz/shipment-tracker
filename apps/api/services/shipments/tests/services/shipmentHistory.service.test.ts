import { beforeEach, describe, expect, it, vi } from "vitest";

// A job's history for managers, page by page, against stand-ins for its repository and the auth look-up.
const repo = vi.hoisted(() => ({ isCompanyJob: vi.fn(), page: vi.fn() }));
const auth = vi.hoisted(() => ({ userLookup: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth }));
vi.mock("../../repositories/shipmentHistory.repository", () => ({ shipmentHistoryRepository: repo }));

import { shipmentHistoryService } from "../../services/shipmentHistory.service";

const JOB = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const AFTER = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c09";
const row = (n: number, userId = "u1") => ({ id: `a${n}`, userId, field: "status", oldValue: "A", newValue: "B", changedAt: new Date(`2026-11-${String(10 + n).padStart(2, "0")}T10:00:00Z`) });

beforeEach(() => {
  vi.clearAllMocks();
  repo.isCompanyJob.mockResolvedValue(true);
  repo.page.mockResolvedValue([row(3), row(2, "u2"), row(1)]);
  auth.userLookup.mockResolvedValue({ users: [{ id: "u1", name: "Eva", email: "eva@firma.cz", role: "user" }] });
});

describe("a job's history", () => {
  it("asks for one entry more than a page holds, and hands the last one shown as the next page's start", async () => {
    const page = await shipmentHistoryService.page("c1", JOB, { limit: 2 });
    expect(repo.page).toHaveBeenCalledWith(JOB, "c1", 3, null);
    // u2 is not found: a user since removed.
    expect(page.entries.map((e) => [e.id, e.userName])).toEqual([["a3", "Eva"], ["a2", "former user"]]);
    expect(page).toMatchObject({ nextBefore: "a2", namesKnown: true });
    expect(auth.userLookup).toHaveBeenCalledWith({ ids: ["u1", "u2"], orSuperadmin: true });
  });

  it("says when there is no older page, and goes on from `before`", async () => {
    const page = await shipmentHistoryService.page("c1", JOB, { before: AFTER });
    expect(repo.page).toHaveBeenCalledWith(JOB, "c1", 51, AFTER);
    expect(page.nextBefore).toBeNull();
  });

  it("comes without names when they can't be read", async () => {
    auth.userLookup.mockRejectedValue(new Error("down"));
    const page = await shipmentHistoryService.page("c1", JOB);
    expect(page.namesKnown).toBe(false);
    expect(page.entries[0]).toMatchObject({ userId: "u1", userName: "", userEmail: "" });
  });

  it("of another company's job, or of no id, is not found; a bad `before` is refused", async () => {
    repo.isCompanyJob.mockResolvedValue(false);
    await expect(shipmentHistoryService.page("c1", JOB)).rejects.toMatchObject({ code: "not_found" });
    await expect(shipmentHistoryService.page("c1", "CZ0001")).rejects.toMatchObject({ code: "not_found" });
    repo.isCompanyJob.mockResolvedValue(true);
    await expect(shipmentHistoryService.page("c1", JOB, { before: "yesterday" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.page).not.toHaveBeenCalled();
  });
});
