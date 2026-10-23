import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { Actor } from "../../../lib/rbac";
import { revisionRoot } from "../../../lib/salesReference";
import { userNames } from "../../../lib/userNames";
import type { FileContent } from "../../../lib/fileContent";
import { quoteCommentRepository } from "../repositories/quoteComment.repository";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";
import { quoteAttachmentBucket } from "../storage/quoteAttachmentBucket";
import { chatFileUrl, companyOfChatFileToken } from "../lib/chatFileToken";
import type { QuoteCommentRecord } from "../schemas/quoteComment.schema";
import type { QuoteCommentItem, QuoteCommentMentionItem, QuoteCommentUnreadItem } from "../interfaces/interfaces";

// The quotes' chat, as the shipments chat: colleagues write, tag each other with @ (a tagged
// colleague is notified under the bell), send files, and see unread counts. Everything is filed
// under the original Sales Reference: a revision (QCZ…001-R1) opens the same thread as the quote it
// revises (QCZ…001), so the whole conversation is under every revision. Any user of the company.

/** How long the bell keeps a read mention, counted from when it was written. */
export const READ_MENTION_KEEP_DAYS = 7;
const MAX_MESSAGE = 5000;
const MAX_FILES_PER_MESSAGE = 10;

export interface NewQuoteComment {
  message: string;
  fileIds: string[];
  mentionedUserIds: string[];
}

export interface NewQuoteChatFile {
  fileName: string;
  fileSize: number;
  fileType: string;
  contentBase64: string;
}

type ChatFile = Awaited<ReturnType<typeof quoteCommentRepository.listChatFiles>>[number];

/** The thread a Sales Reference belongs to: its original reference (revisions share it). */
export const threadOf = (quoteNumber: string) => revisionRoot(quoteNumber.trim());

class QuoteChatService {
  // The thread of a live sales quote of the company; not found otherwise.
  private async thread(actor: Actor, quoteNumber: string): Promise<{ threadRef: string; quoteNumber: string }> {
    const quote = await salesQuoteRepository.loadSales(actor.companyID, quoteNumber);
    if (!quote) throw APIError.notFound("Quote not found");
    return { threadRef: threadOf(quote.quoteNumber), quoteNumber: quote.quoteNumber };
  }

  async list(actor: Actor, quoteNumber: string): Promise<QuoteCommentItem[]> {
    const { threadRef } = await this.thread(actor, quoteNumber);
    const [comments, files, othersReadAt, names] = await Promise.all([
      quoteCommentRepository.listByThread(actor.companyID, threadRef),
      quoteCommentRepository.listChatFiles(actor.companyID, threadRef),
      quoteCommentRepository.lastReadByOthers(actor.companyID, actor.userID, threadRef),
      userNames(),
    ]);
    return comments.map((c) => toItem(c, files, othersReadAt, names, actor.userID));
  }

  // A file for the next message: stored now, tied to the message when it is sent.
  async uploadFile(actor: Actor, quoteNumber: string, file: NewQuoteChatFile): Promise<{ id: string }> {
    const { threadRef } = await this.thread(actor, quoteNumber);
    const fileName = file.fileName.trim().slice(0, 255);
    if (!fileName) throw APIError.invalidArgument("The file has no name");
    const storageKey = `${actor.companyID}/chat/${threadRef}/${randomUUID()}`;
    await quoteAttachmentBucket.upload(storageKey, Buffer.from(file.contentBase64, "base64"), { contentType: file.fileType || "application/octet-stream" });
    const row = await quoteCommentRepository.createFile(actor.companyID, threadRef, { fileName, fileSize: file.fileSize, fileType: file.fileType, storageKey });
    return { id: row.id };
  }

  async create(actor: Actor, quoteNumber: string, input: NewQuoteComment): Promise<QuoteCommentItem> {
    const message = input.message ?? "";
    const fileIds = [...new Set(input.fileIds ?? [])];
    if (!message.trim() && fileIds.length === 0) throw APIError.invalidArgument("message or attachment is required");
    if (message.length > MAX_MESSAGE) throw APIError.invalidArgument(`The message is too long (at most ${MAX_MESSAGE} characters)`);
    if (fileIds.length > MAX_FILES_PER_MESSAGE) throw APIError.invalidArgument(`At most ${MAX_FILES_PER_MESSAGE} files per message`);
    const { threadRef, quoteNumber: writtenOn } = await this.thread(actor, quoteNumber);
    // Only real colleagues of the company can be tagged, and never yourself.
    const names = await userNames();
    const mentions = [...new Set(input.mentionedUserIds ?? [])].filter((id) => id !== actor.userID && names.has(id));
    const comment = await quoteCommentRepository.createForCompany(actor.companyID, {
      threadRef,
      quoteNumber: writtenOn,
      authorId: actor.userID,
      message,
      mentionedUserIds: mentions,
    });
    await quoteCommentRepository.linkFiles(actor.companyID, threadRef, fileIds, comment.id);
    const files = await quoteCommentRepository.listChatFiles(actor.companyID, threadRef);
    return toItem(comment, files, null, names, actor.userID);
  }

  // Only the author deletes a message; its files go with it.
  async delete(actor: Actor, quoteNumber: string, commentId: string): Promise<void> {
    const { threadRef } = await this.thread(actor, quoteNumber);
    if (!(await quoteCommentRepository.deleteOwn(actor.companyID, threadRef, commentId, actor.userID))) throw APIError.notFound("Message not found");
  }

  // Opening the chat (and anything arriving while it is open) counts as read.
  async markRead(actor: Actor, quoteNumber: string): Promise<void> {
    const { threadRef } = await this.thread(actor, quoteNumber);
    await quoteCommentRepository.markRead(actor.companyID, actor.userID, threadRef);
  }

  async unreadCounts(actor: Actor): Promise<QuoteCommentUnreadItem[]> {
    return quoteCommentRepository.unreadCounts(actor.companyID, actor.userID);
  }

  // The bell's quote mentions: unread ones, and read ones written in the last 7 days.
  async mentions(actor: Actor): Promise<QuoteCommentMentionItem[]> {
    const [rows, names] = await Promise.all([quoteCommentRepository.mentions(actor.companyID, actor.userID, READ_MENTION_KEEP_DAYS), userNames()]);
    return rows.map((m) => ({
      id: m.id,
      quoteNumber: m.quoteNumber,
      threadRef: m.threadRef,
      authorName: names.get(m.authorId) ?? "",
      message: m.message,
      createdAt: m.createdAt.toISOString(),
      unread: !m.readAt || m.createdAt > m.readAt,
    }));
  }

  /** The bytes of a chat file for the public content endpoint: only with a valid token for it. */
  async fileContent(id: string, token: string | null): Promise<FileContent | null> {
    const companyId = companyOfChatFileToken(token, id);
    if (!companyId) return null;
    const row = await quoteCommentRepository.getFile(companyId, id);
    if (!row?.storageKey) return null;
    try {
      return { fileName: row.fileName, fileType: row.fileType, buffer: await quoteAttachmentBucket.download(row.storageKey) };
    } catch (err) {
      log.warn(err, "quote chat file missing from storage", { fileId: id });
      return null;
    }
  }
}

function toItem(c: QuoteCommentRecord, files: ChatFile[], othersReadAt: Date | null, names: Map<string, string>, userId: string): QuoteCommentItem {
  return {
    id: c.id,
    quoteNumber: c.quoteNumber,
    threadRef: c.threadRef,
    authorId: c.authorId,
    authorName: names.get(c.authorId) ?? "",
    message: c.message,
    createdAt: c.createdAt.toISOString(),
    attachments: files
      .filter((f) => f.commentId === c.id)
      .map(({ id, fileName, fileSize, fileType }) => ({ id, fileName, fileSize, fileType, contentUrl: chatFileUrl(id, c.companyId) })),
    readByOthers: c.authorId === userId && !!othersReadAt && othersReadAt >= c.createdAt,
  };
}

export const quoteChatService = new QuoteChatService();
