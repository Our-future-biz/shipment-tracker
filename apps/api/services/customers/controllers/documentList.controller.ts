import { api } from "encore.dev/api";
import { documentService } from "../services/document.service";
import type { DocumentItem } from "../interfaces/interfaces";

interface DocumentListRequest {
  customerId: string;
}

interface DocumentListResponse {
  data: DocumentItem[];
}

export const documentList = api(
  { expose: true, auth: false, method: "GET", path: "/customers/:customerId/documents" },
  async (req: DocumentListRequest): Promise<DocumentListResponse> => {
    const data = await documentService.listByCustomer(req.customerId);
    return { data: data as unknown as DocumentItem[] };
  },
);
