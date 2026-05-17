import { api, APIError } from "encore.dev/api";
import { commentService } from "../services/comment.service";
import type { CommentItem } from "../interfaces/interfaces";

interface CommentCreateRequest {
  shipmentId: string;
  authorId: string;
  message: string;
}

interface CommentCreateResponse {
  comment: CommentItem;
}

export const commentCreate = api(
  { expose: true, auth: false, method: "POST", path: "/shipments/:shipmentId/comments" },
  async (req: CommentCreateRequest): Promise<CommentCreateResponse> => {
    if (!req.message) {
      throw APIError.invalidArgument("message is required");
    }
    const comment = await commentService.create(req.shipmentId, req.authorId, req.message);
    return { comment: comment as unknown as CommentItem };
  },
);
