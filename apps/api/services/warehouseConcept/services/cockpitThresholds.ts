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

/** The audit line counts the last this many days. */
export const AUDIT_DAYS = 7;
/** Rows a card's list carries at most; its total is counted over everything. */
export const COCKPIT_LIST_LIMIT = 200;
