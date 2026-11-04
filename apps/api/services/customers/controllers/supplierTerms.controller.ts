import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { supplierTermsService } from "../services/supplierTerms.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface SupplierTermsSetRequest {
  id: string;
  /** Days we have to pay the supplier, 0–365; null while not set (a haulier needs them). */
  paymentDays: number | null;
  /** The currency it is paid in (ISO code), "" while not set; a haulier's CZK or EUR. */
  currency: string & MaxLen<3>;
  vatUnreliable: boolean;
  bankAccountPublished: boolean;
  /** yyyy-mm-dd of the last VAT register check, or "" */
  vatCheckedAt: string & MaxLen<10>;
  /** The published accounts, the whole list (a Czech account or an IBAN each). */
  bankAccounts: (string & MaxLen<50>)[] & MaxLen<20>;
}

interface SupplierTermsSetResponse {
  customer: CustomerItem;
}

// A supplier's payment terms and VAT / bank checks: managers and admins only; a haulier's are copied to Trucking in the same save.
export const supplierTermsSet = api(
  { expose: true, auth: true, method: "PUT", path: "/customers/:id/supplier-terms" },
  async ({ id, ...input }: SupplierTermsSetRequest): Promise<SupplierTermsSetResponse> => {
    const actor = getAuthData()!;
    return { customer: await supplierTermsService.set(actor.companyID, id, { userID: actor.userID, role: actor.role }, input) };
  },
);

interface SupplierTermsCopyResponse {
  /** Hauliers whose terms were copied from Trucking. */
  copied: number;
  /** Those left as they are: their terms were already set here, or Trucking's profile names no live company. */
  skipped: number;
}

// The one-off copy of every haulier's payment terms and VAT / bank details from Trucking (Council Outlay 7,
// step 6b, E2). Only onto companies whose terms were never set here, so it can be run again. Superadmins only.
export const supplierTermsCopyFromTrucking = api(
  { expose: true, auth: true, method: "POST", path: "/customers/supplier-terms/copy-from-trucking" },
  async (): Promise<SupplierTermsCopyResponse> => {
    const actor = requireRole("superadmin");
    return supplierTermsService.copyFromTrucking(actor.companyID);
  },
);
