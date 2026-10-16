import { api } from "encore.dev/api";
import type { MatchesRegexp, MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerAddressService } from "../services/customerAddress.service";
import type { AddressItem, AddressType } from "../interfaces/interfaces";

interface AddressCreateRequest {
  customerId: string;
  type: AddressType;
  label?: string & MaxLen<100>;
  street: string & MinLen<1> & MaxLen<200>;
  city: string & MinLen<1> & MaxLen<200>;
  postalCode: string & MinLen<1> & MaxLen<20>;
  /** ISO 3166-1 alpha-2 */
  country: string & MatchesRegexp<"^[A-Za-z]{2}$">;
}

interface AddressCreateResponse {
  address: AddressItem;
}

export const addressCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:customerId/addresses" },
  async ({ customerId, ...input }: AddressCreateRequest): Promise<AddressCreateResponse> => {
    return { address: await customerAddressService.create(getAuthData()!.companyID, customerId, input) };
  },
);
