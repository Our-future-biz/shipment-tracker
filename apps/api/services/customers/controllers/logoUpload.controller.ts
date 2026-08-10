import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface LogoUploadRequest {
  id: string;
  dataUrl: string;
}

interface LogoUploadResponse {
  customer: CustomerItem;
}

export const logoUpload = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:id/logo/upload" },
  async (req: LogoUploadRequest): Promise<LogoUploadResponse> => {
    if (!req.dataUrl) {
      throw APIError.invalidArgument("dataUrl is required");
    }
    const customer = await customerService.uploadLogo(req.id, getAuthData()!.companyID, req.dataUrl);
    if (!customer) {
      throw APIError.notFound("Customer not found");
    }
    return { customer: customer as unknown as CustomerItem };
  },
);
