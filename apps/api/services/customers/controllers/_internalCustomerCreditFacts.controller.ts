import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { CustomerCreditFacts } from "../interfaces/interfaces";
import { creditFactsService } from "../services/creditFacts.service";

interface CreditFactsRequest {
  customerIds: string[] & MaxLen<2000>;
}

interface CreditFactsResponse {
  customers: CustomerCreditFacts[];
}

// Internal API of the quotes service (the Sales managers' cockpit, Council Outlay 6 D17): what the
// quoted customers owe (services/creditFacts.service).
export const _internalCustomerCreditFacts = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/credit-facts" },
  async ({ customerIds }: CreditFactsRequest): Promise<CreditFactsResponse> => {
    return { customers: await creditFactsService.factsOf(getAuthData()!.companyID, customerIds) };
  },
);
