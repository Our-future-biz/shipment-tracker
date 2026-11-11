// A read written into a new shipment is two calls, create and write (then, for a pre-alert's house,
// a link to its master job). When a later call fails, a retry must carry on with the shipment the
// first try created: creating another would leave the first one behind, its job number used.

/** The shipment a read made, and whether the read's fields are written to it yet. */
export interface ShipmentProgress<S> {
  shipment: S;
  written: boolean;
}

/**
 * Creates the shipment a read goes into and writes the read to it, or carries on where an earlier
 * try stopped. `progress` holds what got done and is updated after each step, so a failure leaves
 * it for the retry: one read never creates two shipments, nor writes its fields twice.
 */
export async function createAndWrite<S>(
  progress: { current: ShipmentProgress<S> | null },
  create: () => Promise<S>,
  write: (shipment: S) => Promise<void>,
): Promise<S> {
  if (!progress.current) progress.current = { shipment: await create(), written: false };
  const made = progress.current;
  if (!made.written) {
    await write(made.shipment);
    made.written = true;
  }
  return made.shipment;
}
