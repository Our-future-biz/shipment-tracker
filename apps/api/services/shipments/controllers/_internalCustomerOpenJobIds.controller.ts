import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";

interface CustomerOpenJobIdsRequest {
  customerId: string & MaxLen<64>;
}

interface CustomerOpenJobIdsResponse {
  /** The customer's live jobs that are not Cancelled, in the caller's company, newest first (at most 5000). */
  shipmentIds: string[];
  /** More than 5000: the oldest are left out. */
  capped: boolean;
}

/**
 * Internal API of the invoicing service (Accounts Receivable's work not yet invoiced, beside the credit limit):
 * the customer's open jobs, whose selling lines not yet on an issued invoice it adds up.
 */
export const _internalCustomerOpenJobIds = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/customer-open-job-ids" },
  async ({ customerId }: CustomerOpenJobIdsRequest): Promise<CustomerOpenJobIdsResponse> =>
    shipmentService.openJobIdsOfCustomer(getAuthData()!.companyID, customerId),
);
