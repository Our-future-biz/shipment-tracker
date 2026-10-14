import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { attachmentService } from "../services/attachment.service";
import type { AttachmentItem } from "../interfaces/interfaces";

interface AttachmentListRequest {
  shipmentId: string;
}

interface AttachmentListResponse {
  attachments: AttachmentItem[];
}

export const attachmentList = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/attachments" },
  async (req: AttachmentListRequest): Promise<AttachmentListResponse> => {
    return { attachments: await attachmentService.list(req.shipmentId, getAuthData()!.companyID) };
  },
);
