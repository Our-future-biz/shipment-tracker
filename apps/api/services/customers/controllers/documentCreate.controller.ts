import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { documentService } from "../services/document.service";
import type { DocumentItem } from "../interfaces/interfaces";

interface DocumentCreateRequest {
  customerId: string;
  name: string;
  type?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileData?: string; // base64 data URL
}

interface DocumentCreateResponse {
  document: DocumentItem;
}

export const documentCreate = api(
  // 20 MiB — the web app accepts files up to 10 MB and sends them as a base64 data URL (~33% larger),
  // which does not fit Encore's 2 MiB default.
  { expose: true, auth: true, method: "POST", path: "/customers/:customerId/documents", bodyLimit: 20 * 1024 * 1024 },
  async (req: DocumentCreateRequest): Promise<DocumentCreateResponse> => {
    if (!req.name) {
      throw APIError.invalidArgument("name is required");
    }
    const { customerId, ...input } = req;
    const document = await documentService.create(getAuthData()!.companyID, customerId, input);
    return { document: document as unknown as DocumentItem };
  },
);
