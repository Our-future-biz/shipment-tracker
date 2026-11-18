import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { CustomerReceivableFacts } from "../interfaces/interfaces";
import { receivableFactsService } from "../services/receivableFacts.service";

interface ReceivableFactsRequest {
  /** The customers of the invoices on the page. */
  ids: string[] & MaxLen<2000>;
}

interface ReceivableFactsResponse {
  customers: CustomerReceivableFacts[];
}

// Internal: Finance → Accounts Receivable (the invoicing service) names, owns and reminds the customers of its
// invoices by these, deleted ones included (services/receivableFacts.service).
export const _internalCustomerReceivableFacts = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/receivable-facts" },
  async ({ ids }: ReceivableFactsRequest): Promise<ReceivableFactsResponse> => {
    return { customers: await receivableFactsService.factsOf(getAuthData()!.companyID, ids) };
  },
);
