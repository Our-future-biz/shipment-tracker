import { api } from "encore.dev/api";
import { attachmentService } from "../services/attachment.service";
import type { AttachmentItem } from "../interfaces/interfaces";

interface AttachmentListRequest {
  shipmentId: string;
}

interface AttachmentListResponse {
  attachments: AttachmentItem[];
}

export const attachmentList = api(
  { expose: true, auth: false, method: "GET", path: "/shipments/:shipmentId/attachments" },
  async (req: AttachmentListRequest): Promise<AttachmentListResponse> => {
    const attachments = await attachmentService.list(req.shipmentId);
    return { attachments: attachments as unknown as AttachmentItem[] };
  },
);
