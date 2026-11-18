// The numbers of the operations managers' cockpit (Shipments → Managers), all in one place. They
// are Council Outlay 11's, as decided on 18 Nov 2026: step 1 keeps the windows the app already
// has, in calendar days of Prague time. Change a number here and the cockpit - and the Shipments
// list's "Cut-offs due" filter, which reads CUTOFF_URGENT_DAYS too - follows.

/** A cut-off (Closing, VGM, SI, AMS, ISF) today or within this many days: URGENT. 1 = today or tomorrow. */
export const CUTOFF_URGENT_DAYS = 1;
/** A cut-off further out, up to this many days ahead: ATTENTION. */
export const CUTOFF_ATTENTION_DAYS = 3;
/** Rows a card's list carries at most; its total is counted over everything. */
export const COCKPIT_LIST_LIMIT = 200;
/** Active jobs the cockpit reads at most, the newest first; the answer says when the company has more. */
export const COCKPIT_JOB_LIMIT = 2000;
