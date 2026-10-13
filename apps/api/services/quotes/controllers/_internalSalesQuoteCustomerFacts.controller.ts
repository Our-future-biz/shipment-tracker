import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { CustomerOpenQuote, CustomerQuoteFacts } from "../interfaces/interfaces";

interface SalesQuoteCustomerFactsResponse {
  /** One entry per customer that a live sales quote of the company is for. */
  customers: CustomerQuoteFacts[];
  /** Every open quote that is for a customer, the newest first. */
  openQuotes: CustomerOpenQuote[];
  /** Sent quotes that name no customer record: they can place no customer. */
  quotesWithoutCustomer: number;
}

/**
 * Internal API of the sales service: what the quotes of the caller's company say about its
 * customers. Customers and shipments live in other databases, so the sales service joins this
 * with their facts into the customer pipeline; nothing of the pipeline is stored.
 */
export const _internalSalesQuoteCustomerFacts = api(
  { expose: false, auth: true, method: "GET", path: "/internal/sales-quotes/customer-facts" },
  async (): Promise<SalesQuoteCustomerFactsResponse> => {
    return salesQuoteService.customerFacts(getAuthData()!.companyID);
  },
);
