import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { commentService } from "../services/comment.service";
import type { CommentItem } from "../interfaces/interfaces";

interface CommentCreateRequest {
  shipmentId: string;
  /** May be empty when the message only carries files. */
  message: string;
  /** Files uploaded beforehand (attachmentCreate) that this message sends. */
  attachmentIds?: string[];
  /** Colleagues tagged with @ in the message; they get a notification. */
  mentionedUserIds?: string[];
}

interface CommentCreateResponse {
  comment: CommentItem;
}

export const commentCreate = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/comments" },
  async (req: CommentCreateRequest): Promise<CommentCreateResponse> => {
    const attachmentIds = req.attachmentIds ?? [];
    if (!req.message && attachmentIds.length === 0) {
      throw APIError.invalidArgument("message or attachment is required");
    }
    const auth = getAuthData()!;
    // Author is the authenticated user — never trusted from the client.
    const comment = await commentService.create(req.shipmentId, auth.companyID, auth.userID, req.message ?? "", attachmentIds, req.mentionedUserIds ?? []);
    return { comment: comment as unknown as CommentItem };
  },
);
