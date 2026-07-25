import { api, APIError } from "encore.dev/api";
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
  { expose: true, auth: false, method: "GET", path: "/customer-documents/:id/content" },
  async (req: DocumentContentRequest): Promise<DocumentContentResponse> => {
    const doc = await documentService.getFileData(req.id);
    if (!doc) {
      throw APIError.notFound("Document not found");
    }
    return { fileName: doc.fileName, fileType: doc.fileType, fileData: doc.fileData };
  },
);
