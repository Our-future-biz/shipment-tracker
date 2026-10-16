import { describe, expect, it } from "vitest";
import { inTripView, tripViewCounts, tripViewOf, tripsNotConfirmed } from "./trips";

const TODAY = "2026-10-16";
const trip = (status: string, plannedPickupDate = "2026-10-20") => ({ status, plannedPickupDate }) as Parameters<typeof inTripView>[0];

describe("trips work queues", () => {
  it("sort trips into Draft, Ordered not confirmed and In transit today", () => {
    const trips = [trip("DRAFT"), trip("ORDERED"), trip("ORDERED", TODAY), trip("CONFIRMED", TODAY), trip("CONFIRMED"), trip("IN_TRANSIT"), trip("DONE", TODAY), trip("CANCELLED", TODAY)];
    expect(tripViewCounts(trips, TODAY)).toEqual({ draft: 1, notConfirmed: 2, inTransitToday: 3 });
    expect(inTripView(trip("DONE", TODAY), "inTransitToday", TODAY)).toBe(false);
  });

  it("count the trips waiting for the haulier's confirmation for the tab", () => {
    expect(tripsNotConfirmed([trip("ORDERED"), trip("CONFIRMED"), trip("ORDERED", TODAY)])).toBe(2);
  });

  it("read the queue from the address", () => {
    expect(tripViewOf("notConfirmed")).toBe("notConfirmed");
    expect(tripViewOf("attention")).toBeNull();
    expect(tripViewOf(null)).toBeNull();
  });
});
