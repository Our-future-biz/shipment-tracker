import { api } from "encore.dev/api";
import type { MatchesRegexp, MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";
import type { CustomerContactRequest } from "../interfaces/requests";

interface CustomerCreateManualRequest {
  /** ISO 3166-1 alpha-2 code of a country other than CZ (Czech companies come from ARES). */
  country: string & MatchesRegexp<"^[A-Za-z]{2}$">;
  companyName: string & MinLen<1> & MaxLen<300>;
  /** The company's number in its country's register (e.g. "HRB 12345"); optional. */
  registrationNumber?: string & MaxLen<50>;
  /** Optional: a customer can be set up before its VAT ID is known. */
  vatId?: string & MaxLen<20>;
  street: string & MinLen<1> & MaxLen<200>;
  city: string & MinLen<1> & MaxLen<200>;
  postalCode: string & MinLen<1> & MaxLen<20>;
  /** The contact person, created as the customer's main contact. */
  contact: CustomerContactRequest;
}

interface CustomerCreateManualResponse {
  customer: CustomerItem;
}

// A customer outside the Czech Republic, typed in by hand.
export const customerCreateManual = api(
  { expose: true, auth: true, method: "POST", path: "/customers/manual" },
  async (req: CustomerCreateManualRequest): Promise<CustomerCreateManualResponse> => {
    return { customer: await customerService.createManual(getAuthData()!.companyID, req) };
  },
);
