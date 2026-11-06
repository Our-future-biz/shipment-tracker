// How the Tracking tab, and later the lists and the bell, read a shipment's dates (Council Outlay
// 8, D15). One place, so a threshold changes everywhere at once.

/** A date moved within this many days still counts as news. */
export const DATE_MOVED_WINDOW_DAYS = 7;
/** Days after the ETA with no ATA before it asks for attention. */
export const ARRIVAL_LATE_AFTER_DAYS = 2;
/** Days after the ETD with no ATD before an export asks for attention. */
export const EXPORT_DEPARTURE_LATE_AFTER_DAYS = 2;
/** A move of this many days reaches the sales person even when the customer wasn't told a date yet. */
export const SALES_TOLD_FROM_DAYS = 3;
/** How far back the bell looks for a date that moved. */
export const BELL_KEEP_DAYS = 30;
/** How long the bell keeps one already read. */
export const BELL_READ_KEEP_DAYS = 7;
/** Working days after the ATA with no gate-in, hub arrival or delivery before it asks for attention. */
export const NO_ONWARD_AFTER_WORKING_DAYS = 3;
/** Days after departure with no event before it asks for attention. Null turns the row off. */
export const NO_EVENT_AFTER_DAYS: number | null = 2;
/** Working days after the ATA / ATD before a job not released for billing asks for attention. */
export const NOT_RELEASED_AFTER_WORKING_DAYS = 3;
/** Days after the tax date, with no invoice, before it warns. */
export const TAX_DATE_WARN_DAYS = 10;
/** Days after the tax date by which the invoice has to be out (§28 ZDPH). */
export const TAX_DATE_LATE_DAYS = 15;

