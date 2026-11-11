import { describe, expect, it } from "vitest";
import { inTripView, tripViewOf, tripViewStatus } from "./trips";

const TODAY = "2026-10-16";
const trip = (status: string, plannedPickupDate = "2026-10-20") => ({ status, plannedPickupDate }) as Parameters<typeof inTripView>[0];

describe("trips work queues", () => {
  it("sort trips into Draft, Ordered not confirmed and In transit today", () => {
    const trips = [trip("DRAFT"), trip("ORDERED"), trip("ORDERED", TODAY), trip("CONFIRMED", TODAY), trip("CONFIRMED"), trip("IN_TRANSIT"), trip("DONE", TODAY), trip("CANCELLED", TODAY)];
    const count = (view: Parameters<typeof inTripView>[1]) => trips.filter((t) => inTripView(t, view, TODAY)).length;
    expect([count("draft"), count("notConfirmed"), count("inTransitToday")]).toEqual([1, 2, 3]);
    expect(inTripView(trip("DONE", TODAY), "inTransitToday", TODAY)).toBe(false);
  });

  it("are listed by the server's status filter where one status is the queue, so a cut list misses none of them", () => {
    expect(tripViewStatus("draft")).toBe("DRAFT");
    expect(tripViewStatus("notConfirmed")).toBe("ORDERED");
    expect(tripViewStatus("inTransitToday")).toBeUndefined();
    expect(tripViewStatus(null)).toBeUndefined();
  });

  it("read the queue from the address", () => {
    expect(tripViewOf("notConfirmed")).toBe("notConfirmed");
    expect(tripViewOf("attention")).toBeNull();
    expect(tripViewOf(null)).toBeNull();
  });
});
