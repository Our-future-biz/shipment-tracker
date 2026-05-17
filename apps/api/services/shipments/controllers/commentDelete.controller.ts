import { api } from "encore.dev/api";
import { commentService } from "../services/comment.service";

interface CommentDeleteRequest {
  shipmentId: string;
  commentId: string;
}

interface CommentDeleteResponse {
  ok: boolean;
}

export const commentDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/shipments/:shipmentId/comments/:commentId" },
  async (req: CommentDeleteRequest): Promise<CommentDeleteResponse> => {
    await commentService.delete(req.commentId);
    return { ok: true };
  },
);
