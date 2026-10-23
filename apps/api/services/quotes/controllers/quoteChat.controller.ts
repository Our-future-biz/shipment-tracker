import { api } from "encore.dev/api";
import type { Min, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { writeFileResponse, writeNotFound } from "../../../lib/fileContent";
import { quoteChatService } from "../services/quoteChat.service";
import type { QuoteCommentItem, QuoteCommentMentionItem, QuoteCommentUnreadItem } from "../interfaces/interfaces";

// The quotes' chat (one thread per original Sales Reference; revisions share it). Any user of the
// company, as the shipments chat.

export const quoteCommentList = api(
  { expose: true, auth: true, method: "GET", path: "/sales-quotes/:quoteNumber/comments" },
  async ({ quoteNumber }: { quoteNumber: string }): Promise<{ comments: QuoteCommentItem[] }> => {
    return { comments: await quoteChatService.list(getAuthData()!, quoteNumber) };
  },
);

interface QuoteCommentCreateRequest {
  quoteNumber: string;
  message: string;
  /** Files uploaded for this message (quoteChatFileUpload). */
  fileIds: string[];
  /** Colleagues tagged with @. */
  mentionedUserIds: string[];
}

export const quoteCommentCreate = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/comments" },
  async ({ quoteNumber, ...input }: QuoteCommentCreateRequest): Promise<{ comment: QuoteCommentItem }> => {
    return { comment: await quoteChatService.create(getAuthData()!, quoteNumber, input) };
  },
);

export const quoteCommentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/sales-quotes/:quoteNumber/comments/:commentId" },
  async ({ quoteNumber, commentId }: { quoteNumber: string; commentId: string }): Promise<void> => {
    await quoteChatService.delete(getAuthData()!, quoteNumber, commentId);
  },
);

export const quoteCommentMarkRead = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/comments/read" },
  async ({ quoteNumber }: { quoteNumber: string }): Promise<{ ok: boolean }> => {
    await quoteChatService.markRead(getAuthData()!, quoteNumber);
    return { ok: true };
  },
);

interface QuoteChatFileUploadRequest {
  quoteNumber: string;
  fileName: string & MinLen<1>;
  fileSize: number & Min<0>;
  fileType: string;
  contentBase64: string;
}

export const quoteChatFileUpload = api(
  // 50 MiB, as a shipment's attachments - base64 inflates bytes ~33%, so raw files up to ~37 MiB.
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/comments/files", bodyLimit: 50 * 1024 * 1024 },
  async ({ quoteNumber, ...file }: QuoteChatFileUploadRequest): Promise<{ id: string }> => {
    return quoteChatService.uploadFile(getAuthData()!, quoteNumber, file);
  },
);

// Unread messages per thread (the Quotes list's chat badges).
export const quoteCommentUnread = api(
  { expose: true, auth: true, method: "GET", path: "/sales-quote-comments/unread" },
  async (): Promise<{ unread: QuoteCommentUnreadItem[] }> => {
    return { unread: await quoteChatService.unreadCounts(getAuthData()!) };
  },
);

// Messages that tag the signed-in user (the bell).
export const quoteCommentMentions = api(
  { expose: true, auth: true, method: "GET", path: "/sales-quote-comments/mentions" },
  async (): Promise<{ mentions: QuoteCommentMentionItem[] }> => {
    return { mentions: await quoteChatService.mentions(getAuthData()!) };
  },
);

// Streams a chat file. Public by necessity (opened as a plain link); the link carries a
// short-lived signed token naming the file and the company, without which nothing is served.
// Path: /sales-quote-chat-files/:id/content?t=<token>[&download=1]
export const quoteChatFileContent = api.raw(
  { expose: true, auth: false, method: "GET", path: "/sales-quote-chat-files/:id/content" },
  async (req, resp) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // [sales-quote-chat-files, id, content]
    const file = await quoteChatService.fileContent(parts[1] ?? "", url.searchParams.get("t"));
    if (!file) {
      writeNotFound(resp);
      return;
    }
    writeFileResponse(resp, file, url.searchParams.get("download") === "1");
  },
);
