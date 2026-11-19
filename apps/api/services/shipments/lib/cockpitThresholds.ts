// The numbers of the operations managers' cockpit (Shipments → Managers), all in one place. They
// are Council Outlay 11's, as decided on 18 Nov 2026 (D6-D8): the two windows are working days
// of Prague time, a missed cut-off stays until the job has left or its ETD has passed, and what "late" means depends on
// how the job travels. Change a number here and the cockpit follows.
import type { FreightKind } from "./trackingEvents";

/** One number per way of travelling. "road" is an international Road Freight job: a Trucking job (Domestic, Road Department) has its stamps from Trucking and none of these rows. */
type PerMode<T> = Readonly<Record<FreightKind, T>>;

// ─── The answer's size ─────────────────────────────────────────────

/** Rows a card's list carries at most; its total is counted over everything. */
export const COCKPIT_LIST_LIMIT = 200;
/** Active jobs the cockpit reads at most, the newest first; the answer says when the company has more. */
export const COCKPIT_JOB_LIMIT = 2000;
/** Days before and after today the company's own holidays are read for: far more than any working-day count here reaches. */
export const HOLIDAY_WINDOW_DAYS = 45;

// ─── The two windows (D6) and a missed cut-off (D7) ────────────────────────

// URGENT is today and the next working day (lib/managersCockpit opsDay): no number of days.
/** ATTENTION: this many working days after the URGENT window (which ends on the next working day). */
export const ATTENTION_WORKING_DAYS = 2;
/**
 * A date that passed with nothing recorded still counts for this many days: "ETD within 3 days"
 * holds for an ETD that passed lately, and a job with NO ETD keeps a missed or overdue cut-off
 * this long after the cut-off's own date - not for ever. (A job with an ETD keeps a missed cut-off
 * until that ETD has passed: the day after, "ETD passed, no ATD" speaks instead.)
 */
export const PASSED_DATE_KEPT_DAYS = 7;
/**
 * The same for an arrival: an import whose ETA passed up to this many days ago with no ATA is
 * still "arriving" (A4, A5) - a vessel runs later than a booking. lib/managersCockpitExtra reads
 * this same number for its own arrival rules, so "arriving" means one thing on the page.
 */
export const ETA_PASSED_KEPT_DAYS = 14;

// ─── URGENT ────────────────────────────────────────────────────

/** U4: Booking Confirmation still Pending with the cargo ready within, or the ETD within, this many days. A flight is booked later than a vessel. */
export const BOOKING_PENDING_WITHIN_DAYS: PerMode<{ cargoReady: number; etd: number }> = {
  sea: { cargoReady: 3, etd: 7 },
  rail: { cargoReady: 3, etd: 7 },
  road: { cargoReady: 3, etd: 7 },
  air: { cargoReady: 1, etd: 2 },
};
/** U6: days after the ETD with no ATD, imports too. Road has no number of its own in the Outlay: it keeps the Tracking tab's 2. */
export const ETD_PASSED_AFTER_DAYS: PerMode<number> = { sea: 2, rail: 2, air: 1, road: 2 };
/** U7: days after the ETA with no ATA. A train is late more often than a truck. */
export const ETA_PASSED_AFTER_DAYS: PerMode<number> = { sea: 2, air: 1, rail: 4, road: 1 };
/** U15: an air export with no MAWB number and the ETD within this many days. */
export const MAWB_MISSING_ETD_WITHIN_DAYS = 1;
/** A22: working days after the delivery with no POD at which it turns URGENT: it holds Billing. */
export const POD_MISSING_URGENT_WORKING_DAYS = 5;

// ─── ATTENTION ───────────────────────────────────────────────────

/** A2: the B/L draft not Approved this many days before the SI closing. */
export const BL_DRAFT_BEFORE_SI_DAYS = 3;
/** A3: working days after an export's ATD with the House BoL not released. */
export const HOUSE_BOL_NOT_RELEASED_AFTER_WORKING_DAYS = 5;
/** A4: an import arriving within this many days with no arrival notice sent. */
export const ARRIVAL_NOTICE_ETA_WITHIN_DAYS = 5;
/** A5: an import arriving within this many days with a container that has no free time typed, or no number. */
export const FREE_TIME_MISSING_ETA_WITHIN_DAYS = 7;
/** A10: working days after the ATA with no gate-in, hub arrival or delivery. Road keeps the Tracking tab's 3. */
export const ARRIVED_NOTHING_SINCE_WORKING_DAYS: PerMode<number> = { sea: 3, rail: 2, air: 1, road: 3 };
/** A11: days after departure with no event. Road keeps the Tracking tab's 2. */
export const NO_TRACKING_AFTER_DAYS: PerMode<number> = { sea: 7, rail: 4, air: 1, road: 2 };
/** A20: working days in our warehouse with no planned delivery and no release. */
export const WAREHOUSE_IDLE_AFTER_WORKING_DAYS = 2;
/** A21: the time of day (Prague) from which tomorrow's pick-up with no haulier confirmed is said: the morning is the dispatcher's. */
export const HAULIER_TOMORROW_FROM = "14:00";
/** A22: working days after the delivery with no POD. */
export const POD_MISSING_AFTER_WORKING_DAYS = 2;
/** A24: Credit Check not Green with the ETD within this many days. */
export const CREDIT_CHECK_ETD_WITHIN_DAYS = 3;

// ─── The signals read from other tables (lib/managersCockpitExtra) ──────────────
// Documents and their customs review, requests waiting for a manager, the customer's Import
// Instructions, the warehouse's remeasurement, how long a status has stood, Master Jobs. A date
// that passed is kept by the two numbers above (PASSED_DATE_KEPT_DAYS, ETA_PASSED_KEPT_DAYS).

/** U10: an import this many days from its ETA (or arrived, until it is delivered) still waiting for its commercial paperwork is URGENT. */
export const PAPERWORK_URGENT_DAYS = 1;
/** A6: …and from this many days out it is ATTENTION. Air and road travel in days, not weeks. */
export const PAPERWORK_ATTENTION_DAYS: PerMode<number> = { sea: 5, rail: 5, air: 2, road: 2 };
/** U10: an import this many days from its ETA whose Master BoL is an original not in hand yet. */
export const ORIGINAL_BL_URGENT_DAYS = 2;
/** U11: dangerous goods without their safety paperwork, this many days before the Closing (the ETD when no Closing): URGENT. */
export const DANGEROUS_URGENT_DAYS = 3;
/** A23: …and this many days before it: ATTENTION. */
export const DANGEROUS_ATTENTION_DAYS = 7;
/** U17: a request waiting for a manager longer than this many working days. */
export const REQUEST_WAITING_WORKING_DAYS = 1;
/** A6: a document customs has not reviewed for this many working days… */
export const REVIEW_WAITING_WORKING_DAYS = 1;
/** …or, on a job that is Urgent for customs, for this many office hours (lib/officeHours). */
export const REVIEW_WAITING_URGENT_OFFICE_HOURS = 4;
/** A6: a declined document with no replacement after this many hours. */
export const DECLINED_NOT_REPLACED_HOURS = 24;
/** A7: a T1 with no Customs Office this many days from its ETA. */
export const T1_OFFICE_DAYS = 3;
/** A8: "Under Customs Clearance" for longer than this many working days. */
export const UNDER_CLEARANCE_WORKING_DAYS = 3;
/** A14: a waiting status unchanged for longer than this many working days. */
export const STATUS_STUCK_WORKING_DAYS = 3;
/** A18: the customer's Import Instructions not answered for longer than this many working days. */
export const IMPORT_INSTRUCTIONS_ANSWER_WORKING_DAYS = 1;
/** A18: a link the customer has not filled in, this many days from the ETA. */
export const IMPORT_INSTRUCTIONS_OPEN_DAYS = 3;
/** A19: a remeasurement that differs and is not accepted after this many hours… */
export const REMEASURE_ATTENTION_HOURS = 24;
/** …by air after this many office hours: the airline bills by what was measured, within the day. */
export const REMEASURE_ATTENTION_AIR_OFFICE_HOURS = 4;
/** …and URGENT after this many hours, */
export const REMEASURE_URGENT_HOURS = 48;
/** …or, by air, when the Closing (the ETD when no Closing) is this many days away. */
export const REMEASURE_URGENT_AIR_DEPARTURE_DAYS = 1;
/** A19: an accepted remeasurement whose costs nobody checked for longer than this many working days. */
export const REMEASURE_COSTS_WORKING_DAYS = 1;
/** A25: an export house of a Master Job this many days from its Closing, out of step. */
export const MASTER_JOB_CLOSING_DAYS = 5;
/** A25: a Master Job this many days from its ETD with no shipment linked. */
export const MASTER_JOB_NO_HOUSE_DAYS = 10;

// ─── The team's signals, the Team facts and the audit line (lib/managersCockpitTeam, lib/managersCockpitAudit) ───
// Step 3 (D3, D23): what a job is told by its to-dos, its chat and its silence, how the people
// line reads a person's load, and how far back the audit line looks.

/** A15: working days with no change, chat line, to-do, task tick or tracking event - on a job older than that. A flight moves faster than a vessel. */
export const NOT_TOUCHED_WORKING_DAYS: PerMode<number> = { sea: 5, rail: 5, road: 5, air: 3 };
/** A16: a to-do past its day is ATTENTION from the first day; from this many working days late it is URGENT. */
export const TODO_LATE_URGENT_WORKING_DAYS = 3;
/** A16: how much of a to-do's title its tag quotes. */
export const TODO_TAG_CHARS = 40;
/** A17: an @mention its Handled By or Holiday Cover has not read for this many office hours (lib/officeHours)… */
export const MENTION_UNREAD_OFFICE_HOURS = 4;
/** …and from this many it is URGENT: a whole office day went by. */
export const MENTION_UNREAD_URGENT_OFFICE_HOURS = 9;
/** Team: a person is marked "high load" with more active jobs than this many times the median… */
export const HIGH_LOAD_FACTOR = 1.5;
/** …of the people with at least one active job - and only when there are at least this many of them: a median of two says nothing. */
export const HIGH_LOAD_MIN_PEOPLE = 3;
/** The audit line: how many days back it counts. */
export const AUDIT_DAYS = 7;
/** The audit line's drill-down: the newest rows it lists at most. */
export const AUDIT_LIST_LIMIT = 200;
/** The audit line: rows one of its reads takes at most; the answer says when there were more. */
export const AUDIT_READ_LIMIT = 5000;
/** The audit line: from this many decided requests their approval rate is given - of a handful it says nothing. */
export const APPROVAL_RATE_MIN_DECIDED = 10;
/**
 * The audit line: minutes a company's line is kept in memory before it is read again. It is the
 * same for every manager and every filter and counts a week: read on each of the page's polls it
 * was six statements a minute per open page for figures that move a few times a day.
 */
export const AUDIT_LINE_KEPT_MINUTES = 5;
/**
 * Connections of the pool (ten, lib/db/pool) the cockpit's answers hold at once, all of them
 * together (one limiter, services/managersCockpit.service): half, so the pages that poll never
 * take them all. The Money tab (services/managersMoney.service) gives each of its answers a
 * limiter of the same size.
 */
export const COCKPIT_READS_AT_ONCE = 5;

// ─── The Money tab (lib/managersMoney) ──────────────────────────────────
// Step 4 (D15, D24-D27): what a job's money asks of a manager. Profit and margin are Costs
// Breakdown's own, in CZK at the job's rates; every other amount stays in its currency.
// "Not invoiced" turns URGENT at the cockpit's own tax-date number (lib/trackingThresholds
// TAX_DATE_LATE_DAYS): it is read from there, not repeated here.

/** Margin: a job with selling lines whose margin is under this many per cent… */
export const MONEY_MARGIN_LOW_PCT = 5;
/** …or whose profit is under this many CZK. */
export const MONEY_PROFIT_LOW_CZK = 1000;
/** Margin: the real cost above the estimate by more than this many per cent… */
export const MONEY_COST_OVER_ESTIMATE_PCT = 10;
/** …AND by more than this many CZK. */
export const MONEY_COST_OVER_ESTIMATE_CZK = 2000;
/** Not invoiced: a job in Billing for more than this many working days with no invoice. */
export const MONEY_IN_BILLING_WORKING_DAYS = 2;
/** Estimates with no supplier invoice, this many days after the job's tax date… */
export const MONEY_ACCRUAL_DAYS = 30;
/** …and URGENT from this many (or once the job is invoiced). */
export const MONEY_ACCRUAL_URGENT_DAYS = 60;
/** A supplier invoice waiting for approval for more than this many working days. */
export const MONEY_SUPPLIER_INVOICE_WAITING_WORKING_DAYS = 2;
/** A cost claim open for more than this many days… */
export const MONEY_COST_CLAIM_DAYS = 30;
/** …and URGENT when open for more than this many. */
export const MONEY_COST_CLAIM_URGENT_DAYS = 60;
/**
 * Jobs that read Invoiced are no active jobs, yet a late supplier invoice, an estimate nobody
 * invoiced and a loss are about exactly them: the Money tab reads them too, for this many days
 * after their tax date (their creation when they have none). Long enough for a late supplier
 * invoice to arrive, short enough for the read to stay small.
 */
export const MONEY_INVOICED_LOOKBACK_DAYS = 90;
/** Invoiced jobs the Money tab reads at most, the newest first; the answer says when there were more. */
export const MONEY_INVOICED_JOB_LIMIT = 1000;
/** A supplier invoice that came after billing is said for this many days after it was booked: then the tag clears by itself. */
export const MONEY_COST_AFTER_BILLING_DAYS = 30;
/** A refused supplier invoice is said for this many days after the last one was refused. */
export const MONEY_REFUSED_DAYS = 14;
/** How many of a job's supplier invoices a tag names before "and N more". */
export const MONEY_TAG_NAMES = 2;
/** Minutes a Money answer is kept in memory per company and filter set: the page asks every five minutes. */
export const MONEY_ANSWER_KEPT_MINUTES = 5;
/** Job ids (and customer ids) one call to Invoicing (to Customers) carries at most: what each of the two endpoints takes. */
export const MONEY_IDS_PER_CALL = 2000;

// ─── Facts from the warehouse and Trucking (lib/managersCockpitHandover) ──────────
// Step 5 (D29, D30): the Warehouse cockpit's and Trucking's own judgement of the jobs, asked by
// shipment so the cockpits never disagree. Their thresholds are their own: none is repeated here.

/**
 * Minutes a module's answer is kept in memory per company. The page asks every minute, per open
 * page, and the warehouse's answer alone is some twenty-five statements on its side: kept for two
 * minutes it is asked at most once in two polls whoever has the page open, and a fact it states is
 * never older than that. Kept by company only - the page's filters are applied to it afterwards,
 * so a filter changed costs no new call. An answer that failed or names a part it could not read
 * is not kept: the next ask tries again.
 */
export const HANDOVER_FACTS_KEPT_MINUTES = 2;
/**
 * Milliseconds the cockpit waits for each module's answer. The page asks every minute and must not
 * hang on a module that is slow: past this the module counts as not read for this answer (it is
 * named, "… (no answer within 6 s)", and gives no tag), while its call goes on - an answer that
 * comes whole after all is kept for the next poll. lib/managersCockpitHandover NO_ANSWER_IN_TIME
 * says the same number in words.
 */
export const HANDOVER_CALL_TIMEOUT_MS = 6_000;

// ─── Step 6, builder B: the delivery order of an import that has arrived (lib/managersCockpitExtra) ───

/**
 * A sea or rail import that arrived (an ATA) and is not delivered, with no Delivery Order date: the
 * cargo can't be collected from the terminal. ATTENTION once a working day has passed since the
 * ATA, URGENT at three - storage and demurrage run meanwhile.
 */
export const DELIVERY_ORDER_ATTENTION_WORKING_DAYS = 1;
export const DELIVERY_ORDER_URGENT_WORKING_DAYS = 3;
// ─── end of builder B's step 6 block ───

// ─── Step 6: who is away (builder A's block; lib/managersCockpitTeam) ──────────
/** "Handled By away from dd.mm.": an absence with no cover that starts within this many working days of today. */
export const AWAY_SOON_WORKING_DAYS = 2;
// ─── end of builder A's block ───

// ─── Step 6: cargo claims (builder C's block; lib/managersCockpitClaims) ──────────
/** "Cargo claim open since dd.mm.": an open cargo claim asks for a look this many days after it was raised. */
export const CLAIM_OPEN_ATTENTION_DAYS = 14;
/** With the claim time limits on: the carrier not notified is URGENT from this many days before the notice deadline. */
export const CLAIM_NOTICE_URGENT_DAYS_BEFORE = 1;
/** With the claim time limits on: the suit time bar is ATTENTION this many days ahead… */
export const CLAIM_SUIT_ATTENTION_DAYS = 60;
/** …and URGENT this many days ahead. */
export const CLAIM_SUIT_URGENT_DAYS = 30;
// ─── end of builder C's block ───
