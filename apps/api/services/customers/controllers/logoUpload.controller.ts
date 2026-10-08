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
  // 5 MiB — the web app accepts logos up to 2 MB and sends them as a base64 data URL (~33% larger),
  // which does not fit Encore's 2 MiB default.
  { expose: true, auth: true, method: "POST", path: "/customers/:id/logo/upload", bodyLimit: 5 * 1024 * 1024 },
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
