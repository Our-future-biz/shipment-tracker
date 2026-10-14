import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface LogoUploadRequest {
  id: string;
  dataUrl: string & MinLen<1>;
}

interface LogoUploadResponse {
  customer: CustomerItem;
}

export const logoUpload = api(
  // 5 MiB — the web app accepts logos up to 2 MB and sends them as a base64 data URL (~33% larger),
  // which does not fit Encore's 2 MiB default.
  { expose: true, auth: true, method: "POST", path: "/customers/:id/logo/upload", bodyLimit: 5 * 1024 * 1024 },
  async (req: LogoUploadRequest): Promise<LogoUploadResponse> => {
    return { customer: await customerService.uploadLogo(req.id, getAuthData()!.companyID, req.dataUrl) };
  },
);
