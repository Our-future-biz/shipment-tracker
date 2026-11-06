import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { commentService } from "../services/comment.service";

interface CommentStrikeRequest {
  shipmentId: string;
  commentId: string;
}

interface CommentStrikeResponse {
  ok: boolean;
}

// The writer crosses out their own message: it stays in the chat, struck through.
export const commentStrike = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/comments/:commentId/strike" },
  async (req: CommentStrikeRequest): Promise<CommentStrikeResponse> => {
    const { companyID, userID } = getAuthData()!;
    await commentService.strike(req.shipmentId, req.commentId, companyID, userID);
    return { ok: true };
  },
);
