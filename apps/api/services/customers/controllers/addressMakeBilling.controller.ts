import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerAddressService } from "../services/customerAddress.service";
import type { AddressItem } from "../interfaces/interfaces";

interface AddressMakeBillingRequest {
  id: string;
}

interface AddressMakeBillingResponse {
  address: AddressItem;
}

/**
 * Makes the address the customer's billing address, the one its invoices are addressed to:
 * Billing moves here from the address that had it, which keeps its other types (or becomes
 * Paperwork when Billing was all it was).
 */
export const addressMakeBilling = api(
  { expose: true, auth: true, method: "POST", path: "/customer-addresses/:id/billing" },
  async ({ id }: AddressMakeBillingRequest): Promise<AddressMakeBillingResponse> => {
    return { address: await customerAddressService.makeBilling(id, getAuthData()!.companyID) };
  },
);
