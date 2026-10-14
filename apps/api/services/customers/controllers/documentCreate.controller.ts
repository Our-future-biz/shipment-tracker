import { api } from "encore.dev/api";
import type { MaxLen, Min, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { documentService } from "../services/document.service";
import type { DocumentItem, DocumentType } from "../interfaces/interfaces";

interface DocumentCreateRequest {
  customerId: string;
  name: string & MinLen<1> & MaxLen<300>;
  type?: DocumentType;
  fileName?: string & MaxLen<300>;
  fileType?: string & MaxLen<200>;
  fileSize?: number & Min<0>;
  fileData?: string; // base64 data URL
}

interface DocumentCreateResponse {
  /** Metadata only: the file bytes are not sent back. */
  document: DocumentItem;
}

export const documentCreate = api(
  // 20 MiB — the web app accepts files up to 10 MB and sends them as a base64 data URL (~33% larger),
  // which does not fit Encore's 2 MiB default.
  { expose: true, auth: true, method: "POST", path: "/customers/:customerId/documents", bodyLimit: 20 * 1024 * 1024 },
  async ({ customerId, ...input }: DocumentCreateRequest): Promise<DocumentCreateResponse> => {
    return { document: await documentService.create(getAuthData()!.companyID, customerId, input) };
  },
);
