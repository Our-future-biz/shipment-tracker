// The thresholds of the Sales managers' cockpit (Sales → Managers), all in one place. They are
// Council Outlay 6's, as decided on 3 Nov 2026 (D16 unless said otherwise). Change a number here
// and the cockpit follows; the two windows the quotes service reads by too are lib/salesCockpitWindows.
import { COCKPIT_EXPIRED_DAYS, COCKPIT_WON_DAYS } from "../../../lib/salesCockpitWindows";

/** Cargo ready on this day or the next with no quotation out, or Won with no shipment: URGENT (U5, U6). */
export const CARGO_READY_DAYS = 1;
/** A big deal: selling of at least this much (CZK)… (U7) */
export const BIG_DEAL_SELLING_CZK = 250_000;
/** …or a profit of at least this much (CZK). */
export const BIG_DEAL_PROFIT_CZK = 40_000;
/** A Won quote at a loss is shown this many days after it was won (U9) - the quotes service reads them as far back. */
export const WON_LOSS_DAYS = COCKPIT_WON_DAYS;

/** Valid until within this many days of a quote awaiting the customer: ATTENTION (A1). */
export const VALIDITY_ATTENTION_DAYS = 2;
/** No contact with a customer awaiting a quote for this many days: ATTENTION (A2; twice the 3-day follow-up). */
export const NO_CONTACT_DAYS = 7;
/** Won this many working days ago with no shipment yet: ATTENTION (A3). */
export const WON_NO_SHIPMENT_WORKING_DAYS = 2;
/** A draft never sent this many working days after it was created: ATTENTION (A4)… */
export const DRAFT_WORKING_DAYS = 2;
/** …and this many for an Air quote, which is wanted faster. */
export const DRAFT_AIR_WORKING_DAYS = 1;
/** A heavy-piece question waiting for the warehouse this many hours: ATTENTION (A10). */
export const WAREHOUSE_INQUIRY_HOURS = 24;
/** A follow-up task this many days past its due day and not done: ATTENTION (A11). */
export const TASK_OVERDUE_DAYS = 2;
/** Expired quotes nobody moved on are shown this many days after their validity ended (A13) - the quotes service reads them as far back. */
export const EXPIRED_DAYS = COCKPIT_EXPIRED_DAYS;
/** Ready to Send for this many working days and not sent: ATTENTION (A5). */
export const READY_TO_SEND_WORKING_DAYS = 1;
/** A margin approved this many hours ago on a quote still not sent: ATTENTION (A7). */
export const APPROVED_NOT_SENT_HOURS = 24;

/** The team line's approval rate above this means the guardrail is a rubber stamp (H3)… */
export const APPROVAL_RUBBER_STAMP_PERCENT = 95;
/** …and below this, that the guardrail is set wrong. */
export const APPROVAL_TOO_STRICT_PERCENT = 20;
/** Fewer answered questions than this in the team line's days say nothing about the guardrail. */
export const APPROVAL_RATE_MIN_ANSWERS = 5;

/** The "Valid until ≤ N days" tile (W5). */
export const VALID_UNTIL_TILE_DAYS = 7;
/** Rows a card's list carries at most; its total is counted over everything. */
export const COCKPIT_LIST_LIMIT = 200;
