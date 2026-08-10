import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { commentService } from "../services/comment.service";
import type { CommentItem } from "../interfaces/interfaces";

interface CommentCreateRequest {
  shipmentId: string;
  message: string;
}

interface CommentCreateResponse {
  comment: CommentItem;
}

export const commentCreate = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/comments" },
  async (req: CommentCreateRequest): Promise<CommentCreateResponse> => {
    if (!req.message) {
      throw APIError.invalidArgument("message is required");
    }
    const auth = getAuthData()!;
    // Author is the authenticated user — never trusted from the client.
    const comment = await commentService.create(req.shipmentId, auth.companyID, auth.userID, req.message);
    return { comment: comment as unknown as CommentItem };
  },
);
