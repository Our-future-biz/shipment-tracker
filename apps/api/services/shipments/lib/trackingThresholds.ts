// How the Tracking tab, and later the lists and the bell, read a shipment's dates (Council Outlay
// 8, D15). One place, so a threshold changes everywhere at once.

/** A date moved within this many days still counts as news. */
export const DATE_MOVED_WINDOW_DAYS = 7;
/** Days after the ETA with no ATA before it asks for attention. */
export const ARRIVAL_LATE_AFTER_DAYS = 2;
/** Days after the ETD with no ATD before an export asks for attention. */
export const EXPORT_DEPARTURE_LATE_AFTER_DAYS = 2;
