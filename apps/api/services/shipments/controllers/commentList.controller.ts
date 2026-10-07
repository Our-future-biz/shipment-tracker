import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { commentService } from "../services/comment.service";
import type { CommentItem } from "../interfaces/interfaces";

interface CommentListRequest {
  shipmentId: string;
}

interface CommentListResponse {
  comments: CommentItem[];
}

export const commentList = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/comments" },
  async (req: CommentListRequest): Promise<CommentListResponse> => {
    const auth = getAuthData()!;
    const comments = await commentService.list(req.shipmentId, auth.companyID, auth.userID);
    return { comments: comments as unknown as CommentItem[] };
  },
);
