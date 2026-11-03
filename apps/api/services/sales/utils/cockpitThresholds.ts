// The thresholds of the Sales managers' cockpit (Sales → Managers), all in one place. They are
// Council Outlay 6's, as decided on 3 Nov 2026 (D16 unless said otherwise). Change a number here
// and the cockpit follows.

/** Cargo ready on this day or the next with no quotation out, or Won with no shipment: URGENT (U5, U6). */
export const CARGO_READY_DAYS = 1;
/** A big deal: selling of at least this much (CZK)… (U7) */
export const BIG_DEAL_SELLING_CZK = 250_000;
/** …or a profit of at least this much (CZK). */
export const BIG_DEAL_PROFIT_CZK = 40_000;
/** A Won quote at a loss is shown this many days after it was won (U9). */
export const WON_LOSS_DAYS = 30;

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
/** Expired quotes nobody moved on are shown this many days after their validity ended (A13). */
export const EXPIRED_DAYS = 7;

/** The "Valid until ≤ N days" tile (W5). */
export const VALID_UNTIL_TILE_DAYS = 7;
/** Rows a card's list carries at most; its total is counted over everything. */
export const COCKPIT_LIST_LIMIT = 200;
