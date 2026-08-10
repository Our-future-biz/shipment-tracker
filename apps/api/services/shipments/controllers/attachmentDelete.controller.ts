import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
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
    await attachmentService.delete(req.attachmentId, getAuthData()!.companyID);
    return { ok: true };
  },
);
