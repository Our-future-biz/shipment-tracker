import { api } from "encore.dev/api";
import type { Max, MaxLen, Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteListRequest {
  /** Rows per page: 50 when left out, at most 200. */
  limit?: number & Min<1> & Max<200>;
  /** How many rows of the sorted list to skip. */
  offset?: number & Min<0>;
  /**
   * For loading everything: the id of the last quote already loaded - for the first page the nil
   * id 00000000-0000-0000-0000-000000000000. The rows are then those with a greater id, in the
   * order of their ids, and offset and sortBy are ignored: no quote is skipped or repeated when
   * quotes are created or deleted meanwhile. A page shorter than the limit is the last one.
   */
  afterId?: string & MaxLen<36>;
  /**
   * createdAt (the default) | updatedAt | quoteNumber | customer | status | owner | sentAt |
   * validUntil | decidedAt | lastContactAt. Anything else sorts by createdAt. Quotes without a
   * value come last in both directions. Status and owner sort as shown (the owner by e-mail).
   */
  sortBy?: string & MaxLen<40>;
  /** desc when left out. */
  sortDirection?: "asc" | "desc";
  /**
   * Words that all have to occur in the quote: in its reference, customer, service type,
   * direction, origin, destination, commodity, incoterm, owner (the owner user's e-mail or name,
   * or the owner text of an old quote), job number or status. Case and diacritics do not matter;
   * at most five words are looked for.
   */
  search?: string & MaxLen<200>;
  /**
   * Statuses as shown, separated by commas: draft, ready_to_send, quoted, feedback, revised, won,
   * lost, expired. A quote whose validity has passed is "expired", not "quoted".
   */
  statuses?: string & MaxLen<200>;
  /** The service type as the quote stores it, e.g. "Air". */
  serviceType?: string & MaxLen<100>;
  /** "Import" or "Export", as the quote stores it. */
  direction?: string & MaxLen<50>;
  /** Created on this day or later (YYYY-MM-DD, the day in Prague). */
  createdFrom?: string;
  /** Created on this day or earlier (YYYY-MM-DD, the day in Prague). */
  createdTo?: string;
  /** Won or lost on this day or later (YYYY-MM-DD, the day in Prague). */
  decidedFrom?: string;
  /** Won or lost on this day or earlier (YYYY-MM-DD, the day in Prague). */
  decidedTo?: string;
  /** "me" (the signed-in user), "none" (quotes that belong to no user) or the id of a user. */
  owner?: string & MaxLen<36>;
  /** The id of the customer the quotes are for. */
  customerId?: string & MaxLen<36>;
  /** "due": only the quotes whose follow-up is due - the ones that carry followUpDue. */
  followUp?: "due";
  /** A quote reference: that quote's base and all its variants (-2, -3, ...). */
  familyOf?: string & MaxLen<50>;
  /** true: only the quotes a shipment names (shipmentJobNumber is set); false: only the quotes none does. */
  hasShipment?: boolean;
}

interface SalesQuoteListResponse {
  pagination: {
    /** How many quotes match the filters in all - also with afterId. */
    total: number;
    offset: number;
    limit: number;
  };
  data: SalesQuoteItem[];
}

/**
 * The company's sales quotes - not the rows of the old quotes module - filtered, searched and
 * sorted by the server, one page at a time, with the real number of matches. Every quote comes
 * with its whole document. A screen that needs all of them loads them with afterId.
 */
export const salesQuoteList = api(
  { expose: true, auth: true, method: "GET", path: "/sales-quotes" },
  async (req: SalesQuoteListRequest): Promise<SalesQuoteListResponse> => {
    return salesQuoteService.list(getAuthData()!, req);
  },
);
