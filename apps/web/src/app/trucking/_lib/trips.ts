import type { TripListItem, TripStatus } from "@/hooks/useTruckingConsignments";

// The work queues of the Trips tab (?view=): tiles over the grid. The server counts them over every
// trip (the list holds only the newest 1000) and lists a queue of one status by it; the grid keeps
// the queue's trips of what it holds. Tested in trips.test.ts.

export type TripView = "draft" | "notConfirmed" | "inTransitToday";

type TripFacts = Pick<TripListItem, "status" | "plannedPickupDate">;

export const TRIP_TILES: { id: TripView; label: string; hint: string; danger?: boolean }[] = [
  { id: "draft", label: "Draft", hint: "Haulier chosen; the transport order is not recorded as sent yet" },
  { id: "notConfirmed", label: "Ordered, not confirmed", hint: "Transport order recorded as sent; the haulier has not confirmed it (or rejected it)", danger: true },
  { id: "inTransitToday", label: "In transit today", hint: "On the road today: picked up and not delivered yet, or ordered for pick-up today (Prague)" },
];

/** Whether a trip is in a work queue; `today` is the company's day (Prague). */
export function inTripView(t: TripFacts, view: TripView, today: string): boolean {
  switch (view) {
    case "draft":
      return t.status === "DRAFT";
    case "notConfirmed":
      return t.status === "ORDERED";
    case "inTransitToday":
      return t.status === "IN_TRANSIT" || (t.plannedPickupDate === today && (t.status === "ORDERED" || t.status === "CONFIRMED"));
  }
}

/** The status the server lists a queue by, when one status is the queue (In transit today is not). */
export const tripViewStatus = (view: TripView | null): TripStatus | undefined => (view === "draft" ? "DRAFT" : view === "notConfirmed" ? "ORDERED" : undefined);

/** The work queue a ?view= value names, or null. */
export const tripViewOf = (param: string | null): TripView | null => TRIP_TILES.find((t) => t.id === param)?.id ?? null;
