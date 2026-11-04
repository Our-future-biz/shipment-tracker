import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import { supplierTermsService } from "../services/supplierTerms.service";
import { isSupplier, type CustomerItem } from "../interfaces/interfaces";
import { canManageSupplierTerms, canRateSupplier } from "../../../lib/salesPolicy";

interface CustomerGetRequest {
  id: string;
}

interface CustomerGetResponse {
  customer: CustomerItem;
  /** Whether the signed-in user may set this company's supplier rating: a manager, and the company is a supplier. */
  canRateSupplier: boolean;
  /** Whether the signed-in user may change its payment terms and VAT / bank details: a manager, and the company is a supplier. */
  canEditSupplierTerms: boolean;
  /**
   * The haulier's terms were never saved here, so `customer.supplierTerms` are Trucking's copy (until the
   * one-off copy, or the first save here, keeps them in the Customer Database).
   */
  supplierTermsFromTrucking: boolean;
}

export const customerGet = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:id" },
  async (req: CustomerGetRequest): Promise<CustomerGetResponse> => {
    const actor = getAuthData()!;
    const customer = await customerService.get(req.id, actor.companyID);
    const supplier = isSupplier(customer.roles);
    const { terms, fromTrucking } = await supplierTermsService.shown(customer);
    return {
      customer: { ...customer, supplierTerms: terms },
      canRateSupplier: canRateSupplier(actor.role) && supplier,
      canEditSupplierTerms: canManageSupplierTerms(actor.role) && supplier,
      supplierTermsFromTrucking: fromTrucking,
    };
  },
);
