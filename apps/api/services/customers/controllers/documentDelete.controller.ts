import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { documentService } from "../services/document.service";

interface DocumentDeleteRequest {
  id: string;
}

interface DocumentDeleteResponse {
  ok: boolean;
}

export const documentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customer-documents/:id" },
  async (req: DocumentDeleteRequest): Promise<DocumentDeleteResponse> => {
    await documentService.softDelete(req.id, getAuthData()!.companyID);
    return { ok: true };
  },
);
