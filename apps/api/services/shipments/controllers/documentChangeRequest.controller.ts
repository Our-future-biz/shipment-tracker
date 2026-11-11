import { api } from "encore.dev/api";
import type { MaxLen, Min, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { writeFileResponse, writeNotFound } from "../../../lib/fileContent";
import type { DocumentChangeRequestItem } from "../interfaces/interfaces";
import { documentChangeRequestService as service } from "../services/documentChangeRequest.service";

// Replacing a document customs has approved: a regular user asks with the new file, a manager
// approves or rejects on the Warehouse Managers page (its Approvals tab), and the answer reaches the
// one who asked under the bell. The service checks the roles.

interface DocumentChangeAskRequest {
  shipmentId: string;
  attachmentId: string;
  fileName: string & MinLen<1>;
  /** Not used: the size stored is that of the file received. Kept so a client that still sends it is accepted. */
  fileSize?: number & Min<0>;
  fileType: string;
  contentBase64: string;
  reason: string & MaxLen<1000>;
}

export const documentChangeRequestAsk = api(
  // 50 MiB, as for adding a document: base64 inflates bytes ~33%, so this allows raw files up to ~37 MiB.
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/attachments/:attachmentId/change-request", bodyLimit: 50 * 1024 * 1024 },
  async ({ shipmentId, attachmentId, ...input }: DocumentChangeAskRequest): Promise<{ request: DocumentChangeRequestItem }> => {
    return { request: await service.ask(getAuthData()!, shipmentId, attachmentId, input) };
  },
);

// The shipment's requests, for its documents' rows.
export const documentChangeRequestsOfShipment = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/document-change-requests" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ requests: DocumentChangeRequestItem[] }> => {
    return { requests: await service.forShipment(getAuthData()!, shipmentId) };
  },
);

// The Approvals tab. Managers only.
export const documentChangeRequestList = api(
  { expose: true, auth: true, method: "GET", path: "/document-change-requests" },
  async (): Promise<{ requests: DocumentChangeRequestItem[] }> => {
    return { requests: await service.listForManagers(getAuthData()!) };
  },
);

interface DocumentChangeDecideRequest {
  id: string;
  approve: boolean;
  /** Rejected: why (required); approved: optional. */
  comment?: string & MaxLen<1000>;
}

// Managers only.
export const documentChangeRequestDecide = api(
  { expose: true, auth: true, method: "POST", path: "/document-change-requests/:id/decide" },
  async ({ id, ...input }: DocumentChangeDecideRequest): Promise<{ request: DocumentChangeRequestItem }> => {
    return { request: await service.decide(getAuthData()!, id, input) };
  },
);

// The bell: the answers to the signed-in user's own requests.
export const documentChangeRequestAnswers = api(
  { expose: true, auth: true, method: "GET", path: "/document-change-request-answers" },
  async (): Promise<{ answers: DocumentChangeRequestItem[] }> => {
    return { answers: await service.myAnswers(getAuthData()!) };
  },
);

// The one who asked opened the answer.
export const documentChangeRequestSeen = api(
  { expose: true, auth: true, method: "POST", path: "/document-change-requests/:id/seen" },
  async ({ id }: { id: string }): Promise<void> => {
    await service.markSeen(getAuthData()!, id);
  },
);

// The waiting new file. Public by necessity, like a document's own link: the browser opens it as a
// plain link, without the auth header, so the link carries a short-lived signed token naming it.
export const documentChangeRequestContent = api.raw(
  { expose: true, auth: false, method: "GET", path: "/document-change-requests/:id/content" },
  async (req, resp) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // [document-change-requests, id, content]
    const file = await service.getContent(parts[1] ?? "", url.searchParams.get("t"));
    if (!file) {
      writeNotFound(resp);
      return;
    }
    writeFileResponse(resp, file, url.searchParams.get("download") === "1");
  },
);
