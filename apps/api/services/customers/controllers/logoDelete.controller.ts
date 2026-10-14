import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface LogoDeleteRequest {
  id: string;
}

interface LogoDeleteResponse {
  customer: CustomerItem;
}

export const logoDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customers/:id/logo" },
  async (req: LogoDeleteRequest): Promise<LogoDeleteResponse> => {
    return { customer: await customerService.deleteLogo(req.id, getAuthData()!.companyID) };
  },
);
