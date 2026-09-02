import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { attachmentService } from "../services/attachment.service";
import type { AttachmentItem } from "../interfaces/interfaces";

/**
 * Customs review of a document. status: "approved" | "declined" | "" (back to pending).
 * A declined document carries a reason the operations team sees in the Documents tab.
 */
interface AttachmentReviewRequest {
  shipmentId: string;
  attachmentId: string;
  status: string;
  note?: string;
}

interface AttachmentReviewResponse {
  attachment: AttachmentItem | null;
}

export const attachmentReview = api(
  { expose: true, auth: true, method: "PATCH", path: "/shipments/:shipmentId/attachments/:attachmentId/review" },
  async (req: AttachmentReviewRequest): Promise<AttachmentReviewResponse> => {
    const auth = getAuthData()!;
    const row = await attachmentService.review(req.attachmentId, auth.companyID, req.status, req.note ?? "", auth.userID);
    return { attachment: row as unknown as AttachmentItem | null };
  },
);
