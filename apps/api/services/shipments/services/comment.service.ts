import { APIError } from "encore.dev/api";
import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { userNames } from "./userNames";
import { attachmentService } from "./attachment.service";

class CommentService {
  async list(shipmentId: string, companyId: string, userId: string) {
    const [comments, files, othersReadAt, names] = await Promise.all([
      shipmentCommentRepository.listByShipmentId(shipmentId, companyId),
      shipmentAttachmentRepository.listChatFilesByShipmentId(shipmentId, companyId),
      shipmentCommentRepository.lastReadByOthers(companyId, userId, shipmentId),
      userNames(),
    ]);
    return comments.map((c) => ({
      ...c,
      authorName: names.get(c.authorId) ?? "",
      attachments: files
        .filter((f) => f.commentId === c.id)
        .map(({ id, fileName, fileSize, fileType }) => ({ id, fileName, fileSize, fileType })),
      // Only meaningful on the reader's own messages: has a colleague opened the chat since?
      readByOthers: c.authorId === userId && !!othersReadAt && othersReadAt >= c.createdAt,
    }));
  }

  async unreadCounts(companyId: string, userId: string) {
    return shipmentCommentRepository.unreadCounts(companyId, userId);
  }

  async markRead(shipmentId: string, companyId: string, userId: string) {
    await shipmentCommentRepository.markRead(companyId, userId, shipmentId);
  }

  async unreadMentions(companyId: string, userId: string) {
    const [rows, names] = await Promise.all([shipmentCommentRepository.unreadMentions(companyId, userId), userNames()]);
    return rows.map(({ authorId, ...r }) => ({ ...r, jobNumber: r.jobNumber ?? "", authorName: names.get(authorId) ?? "" }));
  }

  async create(
    shipmentId: string,
    companyId: string,
    authorId: string,
    message: string,
    attachmentIds: string[] = [],
    mentionedUserIds: string[] = [],
  ) {
    // Only real colleagues from the same company can be tagged, and never yourself.
    const colleagues = await userNames();
    const mentions = [...new Set(mentionedUserIds)].filter((id) => id !== authorId && colleagues.has(id));
    const comment = await shipmentCommentRepository.create({ companyId, shipmentId, authorId, message, mentionedUserIds: mentions });
    await shipmentAttachmentRepository.linkToComment(attachmentIds, comment.id, shipmentId, companyId);
    return comment;
  }

  // Deleting a message takes the files sent with it along (they also show on the Documents tab).
  async delete(id: string, companyId: string, userId: string) {
    const deleted = await shipmentCommentRepository.delete(id, companyId, userId);
    if (!deleted) throw APIError.notFound("Message not found");
    const fileIds = await shipmentAttachmentRepository.listIdsByCommentId(id, companyId);
    for (const fileId of fileIds) await attachmentService.delete(fileId, companyId);
  }
}

export const commentService = new CommentService();
