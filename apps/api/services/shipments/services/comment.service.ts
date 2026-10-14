import { APIError } from "encore.dev/api";
import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import type { ShipmentCommentRecord } from "../schemas/shipmentComment.schema";
import { userNames } from "../../../lib/userNames";
import { attachmentContentUrl } from "../lib/contentToken";
import { iso } from "../../../lib/db/serialize";
import type { CommentItem, CommentMentionItem, CommentUnreadItem } from "../interfaces/interfaces";
import { attachmentService } from "./attachment.service";
import { shipmentService } from "./shipment.service";

type ChatFile = Awaited<ReturnType<typeof shipmentAttachmentRepository.listChatFilesByShipmentId>>[number];

export interface NewComment {
  message: string;
  attachmentIds: string[];
  mentionedUserIds: string[];
}

class CommentService {
  async list(shipmentId: string, companyId: string, userId: string): Promise<CommentItem[]> {
    await shipmentService.requireLive(shipmentId, companyId);
    const [comments, files, othersReadAt, names] = await Promise.all([
      shipmentCommentRepository.listByShipmentId(shipmentId, companyId),
      shipmentAttachmentRepository.listChatFilesByShipmentId(shipmentId, companyId),
      shipmentCommentRepository.lastReadByOthers(companyId, userId, shipmentId),
      userNames(),
    ]);
    return comments.map((c) => this.toItem(c, files, othersReadAt, names, userId));
  }

  // The API shape of a message: author name, its files with download links, and — on the
  // reader's own messages — whether a colleague has opened the chat since.
  private toItem(
    c: ShipmentCommentRecord,
    files: ChatFile[],
    othersReadAt: Date | null,
    names: Map<string, string>,
    userId: string,
  ): CommentItem {
    return {
      id: c.id,
      shipmentId: c.shipmentId,
      authorId: c.authorId,
      authorName: names.get(c.authorId) ?? "",
      message: c.message,
      createdAt: iso(c.createdAt),
      attachments: files
        .filter((f) => f.commentId === c.id)
        .map(({ id, fileName, fileSize, fileType }) => ({
          id,
          fileName,
          fileSize,
          fileType,
          contentUrl: attachmentContentUrl(c.shipmentId, id, c.companyId),
        })),
      readByOthers: c.authorId === userId && !!othersReadAt && othersReadAt >= c.createdAt,
    };
  }

  async unreadCounts(companyId: string, userId: string): Promise<CommentUnreadItem[]> {
    return shipmentCommentRepository.unreadCounts(companyId, userId);
  }

  async markRead(shipmentId: string, companyId: string, userId: string): Promise<void> {
    await shipmentService.requireLive(shipmentId, companyId);
    await shipmentCommentRepository.markRead(companyId, userId, shipmentId);
  }

  async unreadMentions(companyId: string, userId: string): Promise<CommentMentionItem[]> {
    const [rows, names] = await Promise.all([shipmentCommentRepository.unreadMentions(companyId, userId), userNames()]);
    return rows.map((r) => ({
      id: r.id,
      shipmentId: r.shipmentId,
      jobNumber: r.jobNumber ?? "",
      authorName: names.get(r.authorId) ?? "",
      message: r.message,
      createdAt: iso(r.createdAt),
    }));
  }

  async create(shipmentId: string, companyId: string, authorId: string, input: NewComment): Promise<CommentItem> {
    if (!input.message.trim() && input.attachmentIds.length === 0) {
      throw APIError.invalidArgument("message or attachment is required");
    }
    await shipmentService.requireLive(shipmentId, companyId);
    // Only real colleagues from the same company can be tagged, and never yourself.
    const colleagues = await userNames();
    const mentions = [...new Set(input.mentionedUserIds)].filter((id) => id !== authorId && colleagues.has(id));
    const comment = await shipmentCommentRepository.createForCompany(companyId, {
      shipmentId,
      authorId,
      message: input.message,
      mentionedUserIds: mentions,
    });
    await shipmentAttachmentRepository.linkToComment(input.attachmentIds, comment.id, shipmentId, companyId);
    const files = await shipmentAttachmentRepository.listChatFilesByShipmentId(shipmentId, companyId);
    return this.toItem(comment, files, null, colleagues, authorId);
  }

  // Deleting a message takes the files sent with it along (they also show on the Documents tab).
  async delete(shipmentId: string, id: string, companyId: string, userId: string): Promise<void> {
    const deleted = await shipmentCommentRepository.deleteOwn(id, companyId, userId);
    if (!deleted) throw APIError.notFound("Message not found");
    const fileIds = await shipmentAttachmentRepository.listIdsByCommentId(id, companyId);
    for (const fileId of fileIds) await attachmentService.delete(shipmentId, fileId, companyId);
  }
}

export const commentService = new CommentService();
