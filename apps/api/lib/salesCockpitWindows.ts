// How far back the Sales managers' cockpit looks (Council Outlay 6, D16): the quotes service reads
// the quotes by these windows and the sales service judges them by the same ones, so the two are
// set here once. Change a number here and both follow.

/** Expired quotes nobody moved on are shown this many days after their validity ended (A13). */
export const COCKPIT_EXPIRED_DAYS = 7;
/** Won quotes with a shipment are read, and a Won quote at a loss shown, this many days after it was won (U9). */
export const COCKPIT_WON_DAYS = 30;
