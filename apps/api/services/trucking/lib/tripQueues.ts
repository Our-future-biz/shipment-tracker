import type { TripQueueCounts, TripStatus } from "../interfaces/interfaces";

// The Trips tab's work queues, counted over every trip in the database rather than over the newest
// ones a list holds. Pure: the repository counts the trips by status (tripRepository.statusCounts).

/** The trips of one status, and how many of them are planned for pick-up today (the company's day). */
export interface TripStatusCount {
  status: TripStatus;
  n: number;
  pickupToday: number;
}

/**
 * The queues - Draft; Ordered, not confirmed (ORDERED, a rejected order too); In transit today (on
 * the road, or ordered or confirmed for pick-up today) - and how many trips the list's status
 * filter matches.
 */
export function tripQueues(rows: readonly TripStatusCount[], status?: TripStatus): { total: number; counts: TripQueueCounts } {
  const sum = (n: (r: TripStatusCount) => number) => rows.reduce((total, r) => total + n(r), 0);
  return {
    total: sum((r) => (!status || r.status === status ? r.n : 0)),
    counts: {
      draft: sum((r) => (r.status === "DRAFT" ? r.n : 0)),
      notConfirmed: sum((r) => (r.status === "ORDERED" ? r.n : 0)),
      inTransitToday: sum((r) => (r.status === "IN_TRANSIT" ? r.n : r.status === "ORDERED" || r.status === "CONFIRMED" ? r.pickupToday : 0)),
    },
  };
}
