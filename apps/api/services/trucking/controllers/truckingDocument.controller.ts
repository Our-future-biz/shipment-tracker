import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { truckingDocumentService } from "../services/truckingDocument.service";
import type { FileDownload, TruckingDocumentItem, TruckingDocumentKind } from "../interfaces/interfaces";

interface TruckingDocumentListRequest {
  id: string;
}

interface TruckingDocumentListResponse {
  documents: TruckingDocumentItem[];
}

export const truckingDocumentList = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/consignments/:id/documents" },
  async ({ id }: TruckingDocumentListRequest): Promise<TruckingDocumentListResponse> => {
    return { documents: await truckingDocumentService.list(requireRole(), id) };
  },
);

interface TruckingDocumentUploadRequest {
  id: string;
  kind: TruckingDocumentKind;
  fileName: string;
  /** At most 10 MB; the type is taken from the bytes (a POD: photo or PDF) */
  fileBase64: string;
}

interface TruckingDocumentUploadResponse {
  document: TruckingDocumentItem;
}

// Uploads a document of a consignment. A POD does not stamp "POD received" by itself.
export const truckingDocumentUpload = api(
  // 15 MiB: a 10 MB file is ~13.4 MB as base64.
  { expose: true, auth: true, method: "POST", path: "/trucking/consignments/:id/documents", bodyLimit: 15 * 1024 * 1024 },
  async ({ id, ...input }: TruckingDocumentUploadRequest): Promise<TruckingDocumentUploadResponse> => {
    return { document: await truckingDocumentService.upload(requireRole(), id, input) };
  },
);

interface TruckingDocumentContentRequest {
  docId: string;
}

interface TruckingDocumentContentResponse {
  file: FileDownload;
}

export const truckingDocumentContent = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/documents/:docId" },
  async ({ docId }: TruckingDocumentContentRequest): Promise<TruckingDocumentContentResponse> => {
    return { file: await truckingDocumentService.content(requireRole(), docId) };
  },
);
