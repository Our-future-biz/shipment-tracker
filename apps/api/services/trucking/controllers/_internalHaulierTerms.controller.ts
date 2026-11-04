import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { haulierService, type BankAccountsChange } from "../services/haulier.service";
import type { HaulierTerms } from "../interfaces/interfaces";

// A haulier's payment terms and VAT / bank details are kept in the Customer Database (Council Outlay 7,
// step 6b). Trucking keeps a copy its rules run on (status, invoice holds, transport order), which the
// Customer Database updates on every save; and lists what it holds, for the one-off copy the other way.

interface HaulierTermsSetRequest {
  customerId: string;
  terms: HaulierTerms;
  /** When an account was added in this save: when and by whom, as the Customer Database stamped it */
  bankAccountsChange: BankAccountsChange | null;
  byName: string & MaxLen<300>;
}

export const _internalHaulierTermsSet = api(
  { expose: false, auth: true, method: "PUT", path: "/internal/trucking/hauliers/:customerId/terms" },
  async ({ customerId, terms, bankAccountsChange, byName }: HaulierTermsSetRequest): Promise<void> => {
    const actor = getAuthData()!;
    await haulierService.setTermsFromCustomers(actor.companyID, customerId, terms, bankAccountsChange, { userId: actor.userID, name: byName });
  },
);

interface HaulierTermsGetRequest {
  customerId: string;
}

interface HaulierTermsGetResponse {
  /** null when Trucking has no saved profile of the haulier */
  haulier: (HaulierTerms & { bankAccountsChange: BankAccountsChange | null }) | null;
}

// One haulier's terms as Trucking holds them: the Customer Database shows and starts from them until it has its own.
export const _internalHaulierTermsGet = api(
  { expose: false, auth: true, method: "GET", path: "/internal/trucking/hauliers/:customerId/terms" },
  async ({ customerId }: HaulierTermsGetRequest): Promise<HaulierTermsGetResponse> => {
    return { haulier: await haulierService.termsFor(getAuthData()!.companyID, customerId) };
  },
);

interface HaulierTermsListResponse {
  hauliers: (HaulierTerms & { customerId: string; bankAccountsChange: BankAccountsChange | null })[];
}

export const _internalHaulierTermsList = api(
  { expose: false, auth: true, method: "GET", path: "/internal/trucking/haulier-terms" },
  async (): Promise<HaulierTermsListResponse> => {
    return { hauliers: await haulierService.termsList(getAuthData()!.companyID) };
  },
);
