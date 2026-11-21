import { beforeEach, describe, expect, it, vi } from "vitest";

const warehouseConcept = vi.hoisted(() => ({ gateMovementFollow: vi.fn(), gateMovementGet: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { warehouseConcept } }));

import { readFollowed } from "./useGateLog";

// Mock test S21-117: a record opened follows its shipment first (a renumbered job's number, its customs status),
// not only on the 5-minute run or the job's Refresh - which is gone once released.
describe("readFollowed", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    warehouseConcept.gateMovementGet.mockResolvedValue({ movement: { id: "m1" } });
  });

  it("follows the record's shipment without force, then reads the record", async () => {
    const order: string[] = [];
    warehouseConcept.gateMovementFollow.mockImplementation(async () => {
      order.push("follow");
      return { changed: 1 };
    });
    warehouseConcept.gateMovementGet.mockImplementation(async () => {
      order.push("get");
      return { movement: { id: "m1" } };
    });
    await expect(readFollowed("m1")).resolves.toEqual({ movement: { id: "m1" } });
    expect(warehouseConcept.gateMovementFollow).toHaveBeenCalledWith({ id: "m1" });
    expect(order).toEqual(["follow", "get"]);
  });

  it("opens the record all the same when the follow fails (an archived record, Shipments down)", async () => {
    warehouseConcept.gateMovementFollow.mockRejectedValue(new Error("Gate movement not found"));
    await expect(readFollowed("m1")).resolves.toEqual({ movement: { id: "m1" } });
    expect(warehouseConcept.gateMovementGet).toHaveBeenCalledWith("m1");
  });
});
