import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";

interface CustomerOpenQuoteCountRequest {
  customerId: string;
}

interface CustomerOpenQuoteCountResponse {
  /** The customer's live sales quotes still in play today: not won, lost, replaced or expired. */
  count: number;
}

/**
 * Internal API of the customers service: how many open quotes a customer has, asked before it is
 * deleted - a customer an open quote still names is kept.
 */
export const _internalCustomerOpenQuoteCount = api(
  { expose: false, auth: true, method: "GET", path: "/internal/sales-quotes/customer-open-count/:customerId" },
  async ({ customerId }: CustomerOpenQuoteCountRequest): Promise<CustomerOpenQuoteCountResponse> => {
    return { count: await salesQuoteService.openCountOfCustomer(getAuthData()!.companyID, customerId) };
  },
);
