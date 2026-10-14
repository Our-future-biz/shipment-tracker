import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { attachmentService } from "../services/attachment.service";
import type { AttachmentCustomsStatus, AttachmentItem } from "../interfaces/interfaces";

/**
 * Customs review of a document; "" puts it back to pending. A declined document carries a
 * reason the operations team sees in the Documents tab.
 */
interface AttachmentReviewRequest {
  shipmentId: string;
  attachmentId: string;
  status: AttachmentCustomsStatus;
  note?: string;
}

interface AttachmentReviewResponse {
  attachment: AttachmentItem;
}

export const attachmentReview = api(
  { expose: true, auth: true, method: "PATCH", path: "/shipments/:shipmentId/attachments/:attachmentId/review" },
  async (req: AttachmentReviewRequest): Promise<AttachmentReviewResponse> => {
    const auth = getAuthData()!;
    const attachment = await attachmentService.review(
      req.shipmentId,
      req.attachmentId,
      auth.companyID,
      req.status,
      req.note ?? "",
      auth.userID,
    );
    return { attachment };
  },
);
