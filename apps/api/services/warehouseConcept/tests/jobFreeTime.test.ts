import { beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ _internalFreeTimeByContainer: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ shipments }));
vi.mock("../../../lib/outbox/serviceIdentity", () => ({ serviceActor: async () => ({ userID: "svc" }) }));

import { jobFreeTime } from "../services/jobFreeTime";

describe("jobFreeTime", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks by the stored form and answers by the warehouse's own spelling", async () => {
    shipments._internalFreeTimeByContainer.mockResolvedValue({ items: [{ containerNumber: "MSKU6119027", lastFreeDay: "2026-11-20" }] });
    const days = await jobFreeTime("c1", ["MSKU 611 902-7", "CSQU3054383"]);
    expect(shipments._internalFreeTimeByContainer).toHaveBeenCalledWith({ numbers: ["MSKU6119027", "CSQU3054383"] }, { authData: { userID: "svc" } });
    expect([...days]).toEqual([["MSKU 611 902-7", "2026-11-20"]]);
  });

  it("asks nothing without a number", async () => {
    expect((await jobFreeTime("c1", ["", " - "])).size).toBe(0);
    expect(shipments._internalFreeTimeByContainer).not.toHaveBeenCalled();
  });

  it("falls back to what was typed when Shipments is away", async () => {
    shipments._internalFreeTimeByContainer.mockRejectedValue(new Error("down"));
    expect((await jobFreeTime("c1", ["MSKU6119027"])).size).toBe(0);
  });
});
