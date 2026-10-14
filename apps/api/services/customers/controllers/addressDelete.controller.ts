import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerAddressService } from "../services/customerAddress.service";

interface AddressDeleteRequest {
  id: string;
}

interface AddressDeleteResponse {
  ok: boolean;
}

export const addressDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customer-addresses/:id" },
  async (req: AddressDeleteRequest): Promise<AddressDeleteResponse> => {
    await customerAddressService.softDelete(req.id, getAuthData()!.companyID);
    return { ok: true };
  },
);
