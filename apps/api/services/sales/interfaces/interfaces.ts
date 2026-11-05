import type { TaskType } from "../utils/followupTask.utils";
// Plain interfaces for controllers. Never import Drizzle table types here.

export interface TermsConditionItem {
  id: string;
  name: string;
  includes: string;
  excludes: string;
  /** What the rate offer is subject to. */
  subjectTo: string;
  createdAt: string;
  updatedAt: string;
}

/** A manual follow-up task as the Follow-up screen gets it. Times are ISO strings, days are YYYY-MM-DD. */
export interface FollowupTaskItem {
  id: string;
  type: TaskType;
  note: string;
  dueDate: string | null;
  assigneeUserId: string | null;
  /** The assignee's current e-mail; "" for a task assigned to nobody, or to a user that cannot be resolved. */
  assigneeName: string;
  customerId: string | null;
  /** The company as typed, or the customer's name at the time the task was linked to the customer. */
  customerLabel: string;
  contact: string;
  quoteNumber: string | null;
  done: boolean;
  doneAt: string | null;
  /** Due before today and not done. Worked out when the task is read: nobody sets it and nothing stores it. */
  overdue: boolean;
  /** The position the task had in the old shared list; null for a task created since. */
  legacyIndex: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Where a customer stands in the pipeline: prospect - interested, no quote sent yet; proposal - a
 * quote was sent; won - the customer ordered a shipment.
 */
export type PipelineStage = "prospect" | "proposal" | "won";

/**
 * An open quote on a customer's card. The server never converts money: the value of the quote is
 * worked out where every other screen works it out, from these parts of its document.
 */
export interface PipelineOpenQuote {
  quoteNumber: string;
  status: string;
  validUntil: string | null;
  /** The quote's currency as stored; "" when it stores none. */
  currency: string;
  /** ČNB rates and ROE % stored when the quote was sent (data.fx), as stored; null for a draft. */
  fx: unknown;
  /** Rates older quotes stored from the retired weekly sheet (data.rates), as stored. */
  rates: unknown;
  /** The selling lines (data.sellingLines), as stored. */
  sellingLines: unknown;
}

/** A customer on the pipeline board. Times are ISO strings. */
export interface PipelineCard {
  customerId: string;
  companyName: string;
  label: string;
  /** The customer's sales owner as set on the customer: the owner user's e-mail (an old typed name until it is matched). */
  salesOwner: string;
  stage: PipelineStage;
  /** When the first quote for the customer went out; null when none did. */
  firstQuoteSentAt: string | null;
  /** False when that quote has no sent date and firstQuoteSentAt is the day it was created. */
  firstQuoteSentAtKnown: boolean;
  /** The first shipment with the customer: when it was created in the app, and which it is. */
  firstShipmentAt: string | null;
  firstShipmentId: string | null;
  firstJobNumber: string | null;
  shipmentCount: number;
  /** The last write of a quote for the customer or the creation of its newest shipment, whichever is later. */
  lastActivityAt: string | null;
  /** The customer's quotes that are neither decided nor expired, the newest first. */
  openQuotes: PipelineOpenQuote[];
}

/** The customer pipeline. Derived on every read from customers, quotes and shipments; nothing of it is stored. */
export interface PipelineBoard {
  /** The day the Won column starts with (YYYY-MM-DD), as asked; null = all time. */
  wonSince: string | null;
  /** How many customers each column holds in all, whatever part of them `cards` carries. */
  totals: { prospect: number; proposal: number; won: number };
  cards: { prospect: PipelineCard[]; proposal: PipelineCard[]; won: PipelineCard[] };
  /** What the board cannot place, as counts. */
  notes: {
    /** Live shipments without a customer record, or whose customer is no longer in the Customer Database. */
    shipmentsWithoutCustomer: number;
    /** Sent quotes that name no customer record. */
    quotesWithoutCustomer: number;
    /** Sent quotes whose customer is no longer in the Customer Database. */
    quotesOfMissingCustomers: number;
    /** Sent quotes of the customers under Proposal that have no sent date: they count from the day they were created. */
    sentQuotesWithoutDate: number;
    /**
     * Sent quotes and shipments whose company has no Customer role (a supplier only): left off the board, and
     * said so, so its totals do not look complete when they are not (Council Review 5, K13).
     */
    quotesOfNonCustomers: number;
    shipmentsOfNonCustomers: number;
  };
}

/** What the signed-in user may do in Sales beyond a single quote, which carries its own permissions. */
export interface SalesPermissions {
  /** Reassign and delete any quote. */
  canManageSales: boolean;
  /** Create, change and delete Terms & Conditions templates. */
  canEditTerms: boolean;
  /** Change the company details printed on quotations. */
  canEditCompanyDetails: boolean;
}

/**
 * One of a user's own email templates for quotations: the subject and message the Email dialog
 * starts from. Placeholders such as {contact} or {reference} are filled in from the quote there.
 */
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  message: string;
}

/** A user's email templates, as stored. */
export interface EmailTemplatesResponse {
  data: EmailTemplate[];
}

/** The addresses a user emailed quotations to, the latest first: their own list to pick To, CC and BCC from. */
export interface EmailAddressesResponse {
  data: string[];
}

/** What a run of POST /sales/links/normalize did to the company's follow-up tasks. */
export interface SalesLinksNormalizeResult {
  /** Live tasks linked to a customer record. */
  checked: number;
  /** Tasks whose customer name was brought up to date. */
  changed: number;
  /** "customer": the name of a linked customer record that is deleted (the name stays), with how many tasks have it. */
  unmatched: { field: string; value: string; count: number }[];
}

/** Which quotes the Sales managers' cockpit counts: all, or one freight mode (Sea = FCL, LCL and Break Bulk). */
export type SalesCockpitMode = "all" | "sea" | "air" | "rail" | "road";

export interface SalesCockpitTag {
  text: string;
  urgent: boolean;
}

/** A row of a cockpit card: a quote, or a follow-up task that belongs to no quote listed. */
export interface SalesCockpitRow {
  kind: "quote" | "task";
  /** The Sales Reference of a quote; the id of a task. */
  id: string;
  /** What the row is called: the Sales Reference, or the task's customer. */
  ref: string;
  /** The quote's status as shown; the task's type (Call, Email, Visit). */
  status: string;
  /** The quote's freight mode; "" for a task. */
  serviceType: string;
  customer: string;
  /** The quote's Sales Owner, or the task's assignee, by e-mail; "" for nobody. */
  ownerName: string;
  /** The quote's selling in CZK; null for a task. */
  sellingCzk: number | null;
  /** Every signal of the row, the urgent ones first. */
  tags: SalesCockpitTag[];
}

export interface SalesCockpitList {
  /** Every row of the card; `rows` holds at most COCKPIT_LIST_LIMIT of them. */
  total: number;
  rows: SalesCockpitRow[];
}

export interface SalesCockpitTiles {
  /** Draft to Revised, as shown. */
  openQuotes: number;
  /** Their selling in CZK (quotes whose rate is missing count what converts). */
  openSellingCzk: number;
  followUpDue: number;
  /** Drafts never sent. */
  draftsToFinish: number;
  /** Open quotes whose validity ends within VALID_UNTIL_TILE_DAYS. */
  validSoon: number;
  /** Open quotes with no Sales Owner. */
  noOwner: number;
  /** Margin questions waiting for a manager (Quote inquiries). */
  awaitingApproval: number;
  wonThisMonth: number;
  lostThisMonth: number;
}

/** Sales → Managers: what the sales team needs from a manager today (Council Outlay 6). */
export interface SalesManagersCockpit {
  /** ISO time the figures were made. */
  asOf: string;
  /** YYYY-MM-DD, Prague: the day the figures count from. */
  today: string;
  mode: SalesCockpitMode;
  tiles: SalesCockpitTiles;
  /** Act today. */
  urgent: SalesCockpitList;
  /** Within 48 hours, or it becomes urgent. */
  attention: SalesCockpitList;
  health: {
    /** Open quotes whose margin cannot be worked out (a ČNB rate is missing). */
    marginUnknown: number;
    /** Open quotes sent to a customer that is not in the customer records. */
    sentNoCustomer: number;
    /** More quotes matched than the cockpit reads: the figures are of part of them. */
    capped: boolean;
  };
  /** Margin questions of the last days, company-wide (H2); null when the quotes service did not say. */
  audit: SalesCockpitAudit | null;
  /** How the team sold over the last days, company-wide (H3); null when the quotes service did not say. */
  team: SalesCockpitTeam | null;
}

/** The audit line: what managers were asked about margins, and how they answered (H2). */
export interface SalesCockpitAudit {
  days: number;
  asked: number;
  approved: number;
  /** Approved down to a margin the manager set. */
  counter: number;
  rejected: number;
  withdrawn: number;
  /** Answered by the manager who asked or owns the quote (allowed and shown, D9). */
  selfApprovals: number;
  /** Waiting now with the admins told too (D14). */
  escalated: number;
  /** Median office minutes from the ask to the answer; null with no answers. */
  medianOfficeMinutesToDecide: number | null;
  /** Open quotes whose approval no longer covers them (now, not in the last days). */
  approvalsLapsed: number;
}

/** The team line (H3). */
export interface SalesCockpitTeam {
  days: number;
  won: number;
  lost: number;
  /** Won ÷ (Won + Lost), %; null with nothing decided. */
  hitRatePercent: number | null;
  /** Quotes first sent in the days. */
  sent: number;
  medianHoursToFirstSent: number | null;
  /** Lost quotes by the category of their reason, the most first. */
  lostByCategory: { category: string; count: number }[];
  /** Margin questions asked ÷ quotes sent, %; null with nothing sent. */
  neededApprovalPercent: number | null;
  /** Approved ÷ answered, %; null with no answers. */
  approvalRatePercent: number | null;
  /** "rubber stamp" above APPROVAL_RUBBER_STAMP_PERCENT, "too strict" below APPROVAL_TOO_STRICT_PERCENT, with enough answers. */
  approvalWarning: "rubber_stamp" | "too_strict" | null;
}
