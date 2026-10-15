import { api } from "encore.dev/api";
import type { Max, MaxLen, Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { invoiceProfileService } from "../services/invoiceProfile.service";
import type { InvoiceProfileItem } from "../interfaces/interfaces";

/**
 * Issuer details printed on invoices (Settings → Organization → Invoicing details).
 * Everyone can read them (the Invoice panel shows what is missing); only admins edit.
 */

interface GetProfileResponse {
  profile: InvoiceProfileItem;
}

export const invoiceProfileGet = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/profile" },
  async (): Promise<GetProfileResponse> => ({ profile: await invoiceProfileService.get(getAuthData()!.companyID) }),
);

interface BankAccountInput {
  currency: string & MaxLen<3>;
  bankName: string & MaxLen<200>;
  accountNumber: string & MaxLen<50>;
  iban: string & MaxLen<50>;
  swift: string & MaxLen<20>;
}

interface SaveProfileRequest {
  companyName: string & MaxLen<200>;
  street: string & MaxLen<200>;
  city: string & MaxLen<100>;
  postalCode: string & MaxLen<20>;
  country: string & MaxLen<2>;
  ico: string & MaxLen<20>;
  dic: string & MaxLen<20>;
  vatPayer: boolean;
  registerEntry: string & MaxLen<300>;
  email: string & MaxLen<200>;
  phone: string & MaxLen<50>;
  web: string & MaxLen<200>;
  /** PNG / JPEG data URL (about 300 KB at most) */
  logoData: string & MaxLen<400000>;
  bankAccounts: BankAccountInput[] & MaxLen<10>;
  defaultDueDays: number & Min<0> & Max<365>;
  footerNote: string & MaxLen<1000>;
}

export const invoiceProfileSave = api(
  { expose: true, auth: true, method: "PUT", path: "/invoicing/profile" },
  async (req: SaveProfileRequest): Promise<GetProfileResponse> => {
    const actor = requireRole("superadmin", "admin");
    return { profile: await invoiceProfileService.save(actor.companyID, req) };
  },
);
