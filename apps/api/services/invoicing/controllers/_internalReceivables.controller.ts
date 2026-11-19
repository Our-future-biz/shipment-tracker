import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { receivableService } from "../services/receivable.service";
import type { ReceivableCustomerOwedResponse, ReceivableUnbilledResponse, ReleaseCheckInternalResponse } from "../interfaces/interfaces";

// Internal API of the customers service (Finance → Accounts Receivable, D9 and D24; step 7: the work not yet invoiced)
// and of the shipments service (step 7: the prepayment stop). Company from the caller's auth.

interface IssuedNumbersRequest {
  numbers: (string & MaxLen<100>)[] & MaxLen<5000>;
}

interface IssuedNumbersResponse {
  /** Of the numbers asked, those of the caller's company's issued invoices or credit notes */
  numbers: string[];
}

/** A row of the customer's list Invoicing posted is changed only by a credit note there: which numbers are Invoicing's. */
export const _internalIssuedInvoiceNumbers = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/issued-invoice-numbers" },
  async ({ numbers }: IssuedNumbersRequest): Promise<IssuedNumbersResponse> => ({
    numbers: await receivableService.issuedNumbers(getAuthData()!.companyID, numbers),
  }),
);

interface CustomerUnpaidCountRequest {
  customerId: string & MaxLen<64>;
}

interface CustomerUnpaidCountResponse {
  /** Invoices billed to the customer with something left to pay */
  count: number;
}

/** A customer is not deleted while an invoice billed to it is unpaid. */
export const _internalCustomerUnpaidCount = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/customer-unpaid-count" },
  async ({ customerId }: CustomerUnpaidCountRequest): Promise<CustomerUnpaidCountResponse> => ({
    count: await receivableService.customerUnpaidCount(getAuthData()!, customerId),
  }),
);

interface ReleaseCheckRequest {
  shipmentId: string & MaxLen<64>;
}

/**
 * Before a House B/L release or Warehouse Released: the payment warning, and whether the prepayment stop applies (an
 * owed invoice on prepayment, or - L3 - a customer on prepayment with selling not yet invoiced). An error is never
 * "paid": the shipments service refuses the release when it can't ask.
 */
export const _internalReleaseCheck = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/release-check" },
  async ({ shipmentId }: ReleaseCheckRequest): Promise<ReleaseCheckInternalResponse> => receivableService.releaseCheckInternal(getAuthData()!, shipmentId),
);

interface CustomerOwedRequest {
  customerId: string & MaxLen<64>;
}

/**
 * What the customer owes by Invoicing's own figures (the credit warning on a quote or a new shipment, mock test council
 * m5): the same as its Finance tab shows, so an invoice whose hand-over to the customer's list failed counts too.
 */
export const _internalCustomerOwed = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/customer-owed" },
  async ({ customerId }: CustomerOwedRequest): Promise<ReceivableCustomerOwedResponse> => receivableService.customerOwed(getAuthData()!, customerId),
);

interface UnbilledOfCustomerRequest {
  customerId: string & MaxLen<64>;
}

/** The work done on the customer's open jobs not yet invoiced, per currency (beside the credit limit, never "used"). */
export const _internalUnbilledOfCustomer = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/unbilled-of-customer" },
  async ({ customerId }: UnbilledOfCustomerRequest): Promise<ReceivableUnbilledResponse> => receivableService.unbilled(getAuthData()!, customerId),
);
