import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { canManageDocuments } from "../lib/documentRules";
import { attachmentService } from "../services/attachment.service";

interface AttachmentDeleteRequest {
  shipmentId: string;
  attachmentId: string;
}

interface AttachmentDeleteResponse {
  ok: boolean;
}

export const attachmentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId/attachments/:attachmentId" },
  async (req: AttachmentDeleteRequest): Promise<AttachmentDeleteResponse> => {
    // Anyone can add a document; only a manager, an admin or a superadmin can delete one.
    const { companyID, role } = getAuthData()!;
    if (!canManageDocuments(role)) throw APIError.permissionDenied("Only a manager can delete a document");
    await attachmentService.delete(req.shipmentId, req.attachmentId, companyID);
    return { ok: true };
  },
);
