import { beforeEach, describe, expect, it, vi } from "vitest";

const warehouseConcept = vi.hoisted(() => ({ gateMovementFollow: vi.fn(), gateMovementGet: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { warehouseConcept } }));

import { followChangedRecords, readFollowed } from "./useGateLog";

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

  // Review of system-22: a follow that moved the customs status or the job number showed only on the detail; the
  // Gate Log's row and the stock / bonded lists built from the record stayed as they were.
  it("says when the follow changed the record, once it is read, so the lists built from it are read again", async () => {
    const onChanged = vi.fn();
    warehouseConcept.gateMovementFollow.mockResolvedValue({ changed: 1 });
    await readFollowed("m1", onChanged);
    expect(onChanged).toHaveBeenCalledTimes(1);

    onChanged.mockClear();
    warehouseConcept.gateMovementFollow.mockResolvedValue({ changed: 0 });
    await readFollowed("m1", onChanged);
    warehouseConcept.gateMovementFollow.mockRejectedValue(new Error("Shipments down"));
    await readFollowed("m1", onChanged);
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("followChangedRecords", () => {
  it("is true only for a follow that changed a record", () => {
    expect(followChangedRecords({ changed: 1 })).toBe(true);
    expect(followChangedRecords({ changed: 3 })).toBe(true);
    expect(followChangedRecords({ changed: 0 })).toBe(false);
    expect(followChangedRecords(undefined)).toBe(false);
  });
});
