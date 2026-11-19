// The gate's Warehouse Released over a day set in Shipments (mock test council round 4): the gate's outbox sends the
// days its own releases wrote, and Shipments sets the gate's day only over an empty day or one of those - checked in
// the shipment's write turn (services/shipment.service update), so a day a person set between the gate's read and
// its write stays. And a day edited in Shipments from one the gate wrote is still the gate's release, not one made in
// Shipments (services/gateRelease.service warehouseReleasedOf). Pure; tested in tests/gateReleasedDay.test.ts.

/**
 * Whether an app write's Warehouse Released may go over the shipment's day `current`: when it is empty or one of
 * `replaces` (the days the gate's own releases wrote).
 */
export function keepsReleasedDay(current: string | null | undefined, replaces: readonly string[]): boolean {
  const day = (current ?? "").trim();
  return !day || replaces.includes(day);
}

/** A line of Warehouse Released's history: the day before and after one write (null or "" for empty). */
export interface ReleasedDayLine {
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Whether the shipment's Warehouse Released goes back to a day the gate's own release wrote (`gateDays`), though the
 * day now is another (review). A release is the write that sets the day from empty - the only one the prepayment stop
 * holds; a later edit of a day already set is no release of its own. So the field's history, newest first (`lines`),
 * is walked back to the line that set the day from empty: when that day is the gate's, the day now is the gate's
 * release edited in Shipments (a voided gate release leaves its day there, and an edit of it is not stopped) - not a
 * release made in Shipments, and the stop must run. A history that ends without such a line: the day was set before
 * its history was kept (as created or imported), not by the gate. More lines than were read (`complete` false) and
 * none found: not known, so it counts as the gate's - the stop runs rather than let the cargo out on nothing. Never
 * when the gate wrote no day to the job.
 */
export function releaseGoesBackToGateDay(lines: readonly ReleasedDayLine[], gateDays: ReadonlySet<string>, complete: boolean): boolean {
  if (!gateDays.size) return false;
  const set = lines.find((l) => !(l.oldValue ?? "").trim() && !!(l.newValue ?? "").trim());
  if (set) return gateDays.has((set.newValue ?? "").trim());
  return !complete;
}
