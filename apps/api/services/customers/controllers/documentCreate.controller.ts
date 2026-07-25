import { api, APIError } from "encore.dev/api";
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
  { expose: true, auth: false, method: "POST", path: "/customers/:customerId/documents" },
  async (req: DocumentCreateRequest): Promise<DocumentCreateResponse> => {
    if (!req.name) {
      throw APIError.invalidArgument("name is required");
    }
    const { customerId, ...input } = req;
    const document = await documentService.create(customerId, input);
    return { document: document as unknown as DocumentItem };
  },
);
