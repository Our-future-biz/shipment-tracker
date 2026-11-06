import { APIError } from "encore.dev/api";
import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import type { ShipmentCommentRecord } from "../schemas/shipmentComment.schema";
import { userEmails } from "../lib/userEmails";
import { attachmentContentUrl } from "../lib/contentToken";
import { customsOfficeRequestNotice, documentChangeNotice } from "../lib/customsOfficeNotice";
import { canManageDocuments } from "../lib/documentRules";
import { COMPARED_WITH, declaredFigures, dimensionFigures, remeasureNotice, type CargoFigures } from "../lib/remeasureNotice";
import { iso } from "../../../lib/db/serialize";
import { companyUsers, companyUsersWithRoles } from "../../../lib/companyUsers";
import type { CommentItem, CommentMentionItem, CommentUnreadItem, RemeasureNoticeResult } from "../interfaces/interfaces";
import { attachmentService } from "./attachment.service";
import { shipmentService } from "./shipment.service";

type ChatFile = Awaited<ReturnType<typeof shipmentAttachmentRepository.listChatFilesByShipmentId>>[number];

export interface NewComment {
  message: string;
  attachmentIds: string[];
  mentionedUserIds: string[];
}

/** What the warehouse's Inform Operations tells a shipment's chat. */
export interface RemeasureNoticeInput {
  /** The totals of the warehouse's saved remeasured lines. */
  remeasured: CargoFigures;
  /** What the warehouse's screen compared them with (lib/remeasureNotice COMPARED_WITH). */
  comparedWith: string;
  /** Typed with Inform Operations; "" for none. */
  note: string;
}

const MAX_NOTICE_NOTE = 2_000;
const isFigure = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** How long the bell keeps a read mention, counted from when it was written. */
export const READ_MENTION_KEEP_DAYS = 7;

class CommentService {
  async list(shipmentId: string, companyId: string, userId: string): Promise<CommentItem[]> {
    await shipmentService.requireLive(shipmentId, companyId);
    const [comments, files, othersReadAt, emails] = await Promise.all([
      shipmentCommentRepository.listByShipmentId(shipmentId, companyId),
      shipmentAttachmentRepository.listChatFilesByShipmentId(shipmentId, companyId),
      shipmentCommentRepository.lastReadByOthers(companyId, userId, shipmentId),
      userEmails(),
    ]);
    return comments.map((c) => this.toItem(c, files, othersReadAt, emails, userId));
  }

  // The API shape of a message: its author by e-mail (as every person is shown), its files with
  // download links, and — on the reader's own messages — whether a colleague has opened the chat since.
  private toItem(
    c: ShipmentCommentRecord,
    files: ChatFile[],
    othersReadAt: Date | null,
    emails: Map<string, string>,
    userId: string,
  ): CommentItem {
    return {
      id: c.id,
      shipmentId: c.shipmentId,
      authorId: c.authorId,
      authorName: emails.get(c.authorId) ?? "",
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

  // The bell's mentions: unread ones, and read ones written in the last READ_MENTION_KEEP_DAYS days.
  async unreadMentions(companyId: string, userId: string): Promise<CommentMentionItem[]> {
    const [rows, emails] = await Promise.all([shipmentCommentRepository.unreadMentions(companyId, userId, READ_MENTION_KEEP_DAYS), userEmails()]);
    return rows.map((r) => ({
      id: r.id,
      shipmentId: r.shipmentId,
      jobNumber: r.jobNumber ?? "",
      authorName: emails.get(r.authorId) ?? "",
      message: r.message,
      createdAt: iso(r.createdAt),
      unread: !r.readAt || r.createdAt > r.readAt,
    }));
  }

  async create(shipmentId: string, companyId: string, authorId: string, input: NewComment): Promise<CommentItem> {
    if (!input.message.trim() && input.attachmentIds.length === 0) {
      throw APIError.invalidArgument("message or attachment is required");
    }
    await shipmentService.requireLive(shipmentId, companyId);
    // Only real colleagues from the same company can be tagged, and never yourself (the @ list never
    // offers the writer; the warehouse's notice, which may tag its writer, is postRemeasureNotice).
    const colleagues = await userEmails();
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

  /**
   * "Cargo has been remeasured by the warehouse" in a shipment's chat, for the warehouse's Inform
   * Operations: the shipment's figures against the remeasured ones, tagging the shipment's Person in
   * Charge and Holiday Cover as stored - resolved here, never sent by a browser. The one clicking is
   * tagged too when they are one of them: the notice then shows in their own notifications and marks
   * the chat unread for them (unreadCounts counts a writer's own message that tags them). Throws when
   * the company's users can't be read, rather than post a notice that tags nobody. Answers who was
   * tagged (e-mails), so the warehouse can say so - or that nobody is set to notify.
   */
  async postRemeasureNotice(shipmentId: string, companyId: string, authorId: string, input: RemeasureNoticeInput): Promise<RemeasureNoticeResult> {
    const { remeasured, comparedWith, note } = input;
    if (!COMPARED_WITH.some((c) => c === comparedWith)) throw APIError.invalidArgument(`comparedWith must be one of: ${COMPARED_WITH.join(", ")}`);
    if (![remeasured?.colli, remeasured?.weightKg, remeasured?.volumeCbm].every(isFigure)) {
      throw APIError.invalidArgument("The remeasured colli, kg and CBM must be numbers of 0 or more");
    }
    if (note.length > MAX_NOTICE_NOTE) throw APIError.invalidArgument(`The note is too long (at most ${MAX_NOTICE_NOTE} characters)`);
    const shipment = await shipmentService.get(shipmentId, companyId);
    const users = await companyUsers();
    const ours = comparedWith === "declared" ? declaredFigures(shipment) : dimensionFigures(shipment.cargoDimensions ?? []);
    const notice = remeasureNotice(shipment, users, ours, remeasured, note);
    const comment = await shipmentCommentRepository.createForCompany(companyId, {
      shipmentId,
      authorId,
      message: notice.message,
      mentionedUserIds: notice.tagged.map((u) => u.id),
    });
    return { commentId: comment.id, tagged: notice.tagged.map((u) => u.email) };
  }

  /**
   * A request to change a Customs Office in the shipment's chat, as the one asking, tagging everyone
   * who can answer it: it then also shows under their bell, like any message that tags them.
   */
  async postCustomsOfficeRequestNotice(
    shipmentId: string,
    companyId: string,
    authorId: string,
    request: { fromOffice: string; toOffice: string; reason: string },
  ): Promise<void> {
    const notice = customsOfficeRequestNotice(request, await companyUsersWithRoles(), authorId);
    await shipmentCommentRepository.createForCompany(companyId, {
      shipmentId,
      authorId,
      message: notice.message,
      mentionedUserIds: notice.tagged.map((u) => u.id),
    });
  }

  /**
   * A request to replace an approved document in the shipment's chat, as the one asking, tagging
   * everyone who can answer it: it then also shows under their bell, like any message that tags them.
   */
  async postDocumentChangeNotice(
    shipmentId: string,
    companyId: string,
    authorId: string,
    request: { fileName: string; documentType: string; newFileName: string; reason: string },
  ): Promise<void> {
    const notice = documentChangeNotice(request, await companyUsersWithRoles(), authorId);
    await shipmentCommentRepository.createForCompany(companyId, {
      shipmentId,
      authorId,
      message: notice.message,
      mentionedUserIds: notice.tagged.map((u) => u.id),
    });
  }

  // Deleting a message takes the files sent with it along (they also show on the Documents tab) -
  // but only a manager deletes a document, so a regular user's message goes and its files stay.
  async delete(shipmentId: string, id: string, companyId: string, userId: string, role?: string): Promise<void> {
    const deleted = await shipmentCommentRepository.deleteOwn(id, companyId, userId);
    if (!deleted) throw APIError.notFound("Message not found");
    if (role !== undefined && !canManageDocuments(role)) {
      await shipmentAttachmentRepository.unlinkFromComment(id, companyId);
      return;
    }
    const fileIds = await shipmentAttachmentRepository.listIdsByCommentId(id, companyId);
    for (const fileId of fileIds) await attachmentService.delete(shipmentId, fileId, companyId);
  }
}

export const commentService = new CommentService();
