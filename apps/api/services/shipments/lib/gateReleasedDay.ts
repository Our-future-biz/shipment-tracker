// The gate's Warehouse Released over a day set in Shipments (mock test council round 4): the gate's outbox sends the
// days its own releases wrote, and Shipments sets the gate's day only over an empty day or one of those - checked in
// the shipment's write turn (services/shipment.service update), so a day a person set between the gate's read and
// its write stays. Pure; tested in tests/gateReleasedDay.test.ts.

/**
 * Whether an app write's Warehouse Released may go over the shipment's day `current`: when it is empty or one of
 * `replaces` (the days the gate's own releases wrote).
 */
export function keepsReleasedDay(current: string | null | undefined, replaces: readonly string[]): boolean {
  const day = (current ?? "").trim();
  return !day || replaces.includes(day);
}
