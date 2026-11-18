import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { attachmentService } from "../services/attachment.service";
import type { AttachmentCustomsStatus, AttachmentItem } from "../interfaces/interfaces";

/**
 * Customs review of a document; "" puts it back to pending. A declined document carries a
 * reason the operations team sees in the Documents tab. A regular user is refused the approval of
 * a document they uploaded themselves ("You uploaded this document: a colleague or a manager
 * approves it", lib/documentRules): declining it stays theirs, and a manager may approve their own.
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
      auth.role,
    );
    return { attachment };
  },
);
