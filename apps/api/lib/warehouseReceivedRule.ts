// "Received in warehouse" starts the storage clock of the cargo: moved later or cleared, the days in
// between are storage given away, so only a manager does it (as free days above the default);
// setting it the first time or earlier is anyone's - but never a day still to come: the cargo was
// received today at the latest, and a date ahead would give the storage away as well. Once the
// cargo is released its storage is settled: only a manager corrects the date then.
// One rule for the Warehouse Concept gate record and the shipment's own Warehouse Received field.

// Pure, without lib/rbac (which loads the Encore runtime), so it is tested on its own.
const MANAGER_ROLES = ["manager", "admin", "superadmin"];

/** The label of the date in the messages, as the screen of each names it. */
export const RECEIVED_IN_WAREHOUSE = "Received in warehouse";

/**
 * Why this person may not change the received date from `before` to `after` (YYYY-MM-DD, "" for
 * none), or null when they may. `today` is the business day (Prague). Asked only of a change.
 */
export function receivedDateRefusal(
  before: string | null | undefined,
  after: string | null | undefined,
  released: boolean,
  role: string,
  today: string,
  label: string = RECEIVED_IN_WAREHOUSE,
): string | null {
  if (MANAGER_ROLES.includes(role)) return null;
  if (released) return `The cargo was released: only a manager changes ${label} now`;
  if (after && after > today) return `${label} can't be a day still to come: the cargo was received today at the latest`;
  if (before && (!after || after > before)) return `Only a manager moves ${label} later or clears it: the days in between are storage given away`;
  return null;
}
