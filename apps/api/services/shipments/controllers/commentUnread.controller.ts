import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { commentService } from "../services/comment.service";
import type { CommentUnreadItem, CommentMentionItem } from "../interfaces/interfaces";

interface CommentUnreadResponse {
  /** Only shipments that have something unread for this user. */
  unread: CommentUnreadItem[];
}

// How many chat messages each shipment has that this user has not seen yet.
export const commentUnread = api(
  { expose: true, auth: true, method: "GET", path: "/shipment-comments/unread" },
  async (): Promise<CommentUnreadResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { unread: await commentService.unreadCounts(companyID, userID) };
  },
);

// Chat messages that tag this user and that they have not seen yet — the notification bell.
export const commentMentions = api(
  { expose: true, auth: true, method: "GET", path: "/shipment-comments/mentions" },
  async (): Promise<{ mentions: CommentMentionItem[] }> => {
    const { companyID, userID } = getAuthData()!;
    const mentions = await commentService.unreadMentions(companyID, userID);
    return { mentions: mentions as unknown as CommentMentionItem[] };
  },
);

// Marks a shipment's chat as read up to now (called when the chat is opened).
export const commentMarkRead = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/comments/read" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ ok: boolean }> => {
    const { companyID, userID } = getAuthData()!;
    await commentService.markRead(shipmentId, companyID, userID);
    return { ok: true };
  },
);
