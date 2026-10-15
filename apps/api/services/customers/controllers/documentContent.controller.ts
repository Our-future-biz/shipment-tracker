import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { documentService } from "../services/document.service";

interface DocumentContentRequest {
  id: string;
}

interface DocumentContentResponse {
  fileName: string;
  fileType: string;
  fileData: string; // base64 data URL
}

export const documentContent = api(
  { expose: true, auth: true, method: "GET", path: "/customer-documents/:id/content" },
  async (req: DocumentContentRequest): Promise<DocumentContentResponse> => {
    return documentService.getFile(req.id, getAuthData()!.companyID);
  },
);
