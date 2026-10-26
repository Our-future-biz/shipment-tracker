// The Shipment Owner of a gate record is a user of the company, stored and shown by e-mail
// (owner decision 26 Oct 2026). Walk-ins used to get the text below as their owner; it is now
// only the empty field's hint, and an older record holding it reads as nobody.

export const NOTIFY_OPS_HINT = "— notify ops";

/** The Shipment Owner as shown and edited: the old walk-in placeholder counts as empty. */
export const shipmentOwnerOf = (value: string | null | undefined): string => {
  const v = value ?? "";
  return v === NOTIFY_OPS_HINT ? "" : v;
};

/** Hint of an empty Shipment Owner: an unlinked record (a walk-in) waits for ops to name one. */
export const shipmentOwnerHint = (m: { warehouseTaskId: string | null }): string => (m.warehouseTaskId ? "—" : NOTIFY_OPS_HINT);
