import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { CustomerCreditWarning } from "../interfaces/interfaces";
import { creditFactsService } from "../services/creditFacts.service";

interface CustomerCreditWarningRequest {
  id: string;
}

// The credit warning on a new quote or shipment (Council Outlay 10 D21), for everyone: the credit limit, the terms,
// and what the customer owes and has overdue, per currency (services/creditFacts.service). A warning, never a stop.
export const customerCreditWarning = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:id/credit-warning" },
  async ({ id }: CustomerCreditWarningRequest): Promise<CustomerCreditWarning> => {
    return creditFactsService.warningOf(getAuthData()!.companyID, id);
  },
);
