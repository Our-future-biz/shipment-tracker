import { api } from "encore.dev/api";
import { documentService } from "../services/document.service";

interface DocumentDeleteRequest {
  id: string;
}

interface DocumentDeleteResponse {
  ok: boolean;
}

export const documentDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/customer-documents/:id" },
  async (req: DocumentDeleteRequest): Promise<DocumentDeleteResponse> => {
    await documentService.softDelete(req.id);
    return { ok: true };
  },
);
