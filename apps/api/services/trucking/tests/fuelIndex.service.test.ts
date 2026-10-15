import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const repo = vi.hoisted(() => ({ list: vi.fn(), set: vi.fn() }));
vi.mock("../repositories/fuelIndex.repository", () => ({ fuelIndexRepository: repo }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { fuelIndexService } from "../services/fuelIndex.service";

const C = "00000000-0000-0000-0000-000000000001";
const U = "00000000-0000-0000-0000-000000000002";

beforeEach(() => {
  vi.resetAllMocks();
  repo.list.mockResolvedValue([{ month: "2026-10", percent: 12 }]);
});

describe("fuel index", () => {
  it("is set by a manager only, as a month and a % from 0 to 100", async () => {
    await expect(fuelIndexService.set(C, U, "user", "2026-11", 10)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(fuelIndexService.set(C, U, "manager", "2026-13", 10)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(fuelIndexService.set(C, U, "manager", "2026-11", 101)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.set).not.toHaveBeenCalled();
  });

  it("writes the change with its before and after", async () => {
    await fuelIndexService.set(C, U, "admin", "2026-10", 13.5);
    expect(repo.set).toHaveBeenCalledWith(C, "2026-10", 13.5, "Jana Nováková", expect.objectContaining({
      kind: "fuel_index_set",
      payload: { changes: { "2026-10": { before: 12, after: 13.5 } } },
    }));
  });

  it("writes nothing when the % is unchanged", async () => {
    expect(await fuelIndexService.set(C, U, "manager", "2026-10", 12)).toEqual([{ month: "2026-10", percent: 12 }]);
    expect(repo.set).not.toHaveBeenCalled();
  });
});
