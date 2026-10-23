import { CUSTOMS_WARNING_DAYS } from "./warehouseStockCustoms";

// The thresholds of the managers' cockpit (Warehouse Concept → Managers), all in one place.
// They are the recommendations of Council Outlay 5 (23 Oct 2026); the decisions behind them are
// still open, so each names its decision. Change a number here and the cockpit follows.

/** Customs deadline (UCC art. 149): URGENT when overdue or this many days left or fewer (D2). */
export const CUSTOMS_URGENT_DAYS = 2;
/** Customs deadline: ATTENTION up to this many days left (the module's existing warning). */
export const CUSTOMS_ATTENTION_DAYS = CUSTOMS_WARNING_DAYS;

/** On hold: an open exception older than this is ATTENTION (D13). */
export const ON_HOLD_ATTENTION_HOURS = 24;
/** On hold: an open exception older than this is URGENT (D13). */
export const ON_HOLD_URGENT_HOURS = 48;

/** Import container gated in, stripping not complete after this many hours: ATTENTION (A3). */
export const STRIPPING_OPEN_HOURS = 24;
/** Export container closed (sealed) with no gate-out after this many hours: ATTENTION (D9). */
export const CLOSED_NO_GATE_OUT_HOURS = 24;
/** Ready for release with no pick-up booked: ATTENTION at this many free days left or fewer (D8). */
export const READY_FREE_DAYS_LEFT = 2;

// ─── Step 2: time passed ───────────────────────────────────────

/** Inbound truck gated in, no receipt after this many hours: ATTENTION (D4). */
export const ARRIVED_NOT_RECEIVED_ATTENTION_HOURS = 4;
/** … and URGENT after this many hours (D4). */
export const ARRIVED_NOT_RECEIVED_URGENT_HOURS = 8;
/** A Trucking trip's planned arrival is "not arrived" this many hours after its gate time (D5). */
export const TRIP_LATE_HOURS = 2;
/** A release request still blocked after this many hours: URGENT (D6). */
export const RELEASE_BLOCKED_HOURS = 2;
/** An MRN asked for and still missing after this many hours says so on its tag (D10). */
export const MRN_REQUEST_HOURS = 24;
/** A linked record's customs status not read from its shipment for this many hours (the follow runs every 5 minutes). */
export const CUSTOMS_READ_STALE_HOURS = 24;
/** "Shipment may need correcting" stays on the cockpit this many days (it has no Dismiss yet). */
export const MAY_NEED_CORRECTING_DAYS = 7;
/** Cargo released with storage charged and "Storage settled" never ticked: shown this many days after it left. */
export const RELEASED_CHARGEABLE_DAYS = 7;

// ─── Step 2: delivery health ───────────────────────────────────

/** A shipment update or Trucking event still pending after this many minutes counts as waiting too long (D17). */
export const STALE_PENDING_MINUTES = 30;
/** Supplier e-mails (VGM, survey, remeasurement) that failed are counted over this many days. */
export const SUPPLIER_EMAIL_DAYS = 7;

/** The audit line counts the last this many days. */
export const AUDIT_DAYS = 7;
/** Rows a card's list carries at most; its total is counted over everything. */
export const COCKPIT_LIST_LIMIT = 200;
