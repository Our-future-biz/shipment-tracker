import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { masterJobDocumentService } from "../services/masterJobDocument.service";
import { writeFileResponse, writeNotFound } from "../../../lib/fileContent";
import type { MasterJobDocumentItem } from "../interfaces/interfaces";

// A master job's Documents tab: its own files, apart from the shipments' documents.

interface MasterJobDocumentListRequest {
  masterJobId: string;
}

interface MasterJobDocumentListResponse {
  documents: MasterJobDocumentItem[];
}

export const masterJobDocumentList = api(
  { expose: true, auth: true, method: "GET", path: "/master-jobs/:masterJobId/documents" },
  async (req: MasterJobDocumentListRequest): Promise<MasterJobDocumentListResponse> => {
    return { documents: await masterJobDocumentService.list(req.masterJobId, getAuthData()!.companyID) };
  },
);

interface MasterJobDocumentCreateRequest {
  masterJobId: string;
  fileName: string & MinLen<1> & MaxLen<255>;
  fileType: string;
  /** Required; an empty file is refused by the service with a readable message, not by request validation. */
  contentBase64: string;
  /** The business document type, chosen before the file is added. */
  documentType: string & MinLen<1> & MaxLen<100>;
}

interface MasterJobDocumentCreateResponse {
  document: MasterJobDocumentItem;
}

export const masterJobDocumentCreate = api(
  // 50 MiB, as a shipment's documents: base64 inflates bytes ~33%, so this allows raw files up to ~37 MiB.
  { expose: true, auth: true, method: "POST", path: "/master-jobs/:masterJobId/documents", bodyLimit: 50 * 1024 * 1024 },
  async (req: MasterJobDocumentCreateRequest): Promise<MasterJobDocumentCreateResponse> => {
    const auth = getAuthData()!;
    const document = await masterJobDocumentService.create(
      req.masterJobId,
      auth.companyID,
      { fileName: req.fileName, fileType: req.fileType, contentBase64: req.contentBase64, documentType: req.documentType },
      auth.userID,
    );
    return { document };
  },
);

interface MasterJobDocumentDeleteRequest {
  masterJobId: string;
  documentId: string;
}

interface MasterJobDocumentDeleteResponse {
  ok: boolean;
}

export const masterJobDocumentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/master-jobs/:masterJobId/documents/:documentId" },
  async (req: MasterJobDocumentDeleteRequest): Promise<MasterJobDocumentDeleteResponse> => {
    // Anyone can add a document; only a manager, an admin or a superadmin can delete one (checked in the service).
    const { companyID, role } = getAuthData()!;
    await masterJobDocumentService.delete(req.masterJobId, req.documentId, companyID, role);
    return { ok: true };
  },
);

// Streams the raw file bytes. Inline (viewable) only for allow-listed safe types; otherwise served
// as an attachment download. Path: /master-jobs/:masterJobId/documents/:documentId/content?t=<token>[&download=1]
export const masterJobDocumentContent = api.raw(
  // Public by necessity: the browser opens this as a plain link, without the auth header. Instead
  // the link carries a short-lived signed token (MasterJobDocumentItem.contentUrl) naming the
  // document and the company; without a valid one nothing is served.
  { expose: true, auth: false, method: "GET", path: "/master-jobs/:masterJobId/documents/:documentId/content" },
  async (req, resp) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // [master-jobs, mjId, documents, id, content]
    const file = await masterJobDocumentService.getContent(parts[1] ?? "", parts[3] ?? "", url.searchParams.get("t"));
    if (!file) {
      writeNotFound(resp);
      return;
    }
    writeFileResponse(resp, file, url.searchParams.get("download") === "1");
  },
);
