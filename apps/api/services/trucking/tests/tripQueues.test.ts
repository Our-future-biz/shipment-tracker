import { describe, expect, it } from "vitest";
import { tripQueues } from "../lib/tripQueues";

describe("the Trips tab's work queues", () => {
  const rows = [
    { status: "DRAFT" as const, n: 4, pickupToday: 1 },
    { status: "ORDERED" as const, n: 1200, pickupToday: 3 },
    { status: "CONFIRMED" as const, n: 7, pickupToday: 2 },
    { status: "IN_TRANSIT" as const, n: 5, pickupToday: 0 },
    { status: "DONE" as const, n: 9000, pickupToday: 6 },
  ];

  it("counts Draft, Ordered not confirmed and In transit today over every trip", () => {
    // In transit today = every trip on the road + the ordered and confirmed ones picked up today (not a draft's or a done one's day).
    expect(tripQueues(rows).counts).toEqual({ draft: 4, notConfirmed: 1200, inTransitToday: 10 });
  });

  it("says how many trips the status filter matches, listed or not", () => {
    expect(tripQueues(rows).total).toBe(10216);
    expect(tripQueues(rows, "ORDERED").total).toBe(1200);
    expect(tripQueues(rows, "CANCELLED").total).toBe(0);
    expect(tripQueues([])).toEqual({ total: 0, counts: { draft: 0, notConfirmed: 0, inTransitToday: 0 } });
  });
});
