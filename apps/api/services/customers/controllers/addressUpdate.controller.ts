import { api } from "encore.dev/api";
import type { MatchesRegexp, MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerAddressService } from "../services/customerAddress.service";
import type { AddressItem, AddressType } from "../interfaces/interfaces";

interface AddressUpdateRequest {
  id: string;
  type?: AddressType;
  label?: string & MaxLen<100>;
  street?: string & MinLen<1> & MaxLen<200>;
  city?: string & MinLen<1> & MaxLen<200>;
  postalCode?: string & MinLen<1> & MaxLen<20>;
  /** ISO 3166-1 alpha-2 */
  country?: string & MatchesRegexp<"^[A-Za-z]{2}$">;
}

interface AddressUpdateResponse {
  address: AddressItem;
}

export const addressUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/customer-addresses/:id" },
  async ({ id, ...input }: AddressUpdateRequest): Promise<AddressUpdateResponse> => {
    return { address: await customerAddressService.update(id, getAuthData()!.companyID, input) };
  },
);
