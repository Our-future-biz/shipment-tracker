import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerAddressService } from "../services/customerAddress.service";
import type { AddressItem } from "../interfaces/interfaces";

interface AddressListRequest {
  customerId: string;
}

interface AddressListResponse {
  data: AddressItem[];
}

export const addressList = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:customerId/addresses" },
  async (req: AddressListRequest): Promise<AddressListResponse> => {
    return { data: await customerAddressService.listByCustomer(req.customerId, getAuthData()!.companyID) };
  },
);
