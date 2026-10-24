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
  /** The assignee's current display name; "" for a task assigned to nobody, or to a user that cannot be resolved. */
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
  /** The customer's sales owner, as set on the customer. */
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
