import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { documentService } from "../services/document.service";
import type { DocumentItem } from "../interfaces/interfaces";

interface DocumentListRequest {
  customerId: string;
}

interface DocumentListResponse {
  data: DocumentItem[];
}

export const documentList = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:customerId/documents" },
  async (req: DocumentListRequest): Promise<DocumentListResponse> => {
    return { data: await documentService.listByCustomer(req.customerId, getAuthData()!.companyID) };
  },
);
