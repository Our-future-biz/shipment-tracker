import { api, APIError } from "encore.dev/api";
import { quoteAttachmentService } from "../services/quoteAttachment.service";
import type { QuoteAttachmentItem } from "../interfaces/interfaces";

interface QuoteAttachmentListRequest {
  quoteNumber: string;
}

interface QuoteAttachmentListResponse {
  attachments: QuoteAttachmentItem[];
}

export const quoteAttachmentList = api(
  { expose: true, auth: false, method: "GET", path: "/quotes/:quoteNumber/attachments" },
  async (req: QuoteAttachmentListRequest): Promise<QuoteAttachmentListResponse> => {
    const attachments = await quoteAttachmentService.list(req.quoteNumber);
    return { attachments: attachments as unknown as QuoteAttachmentItem[] };
  },
);

interface QuoteAttachmentCreateRequest {
  quoteNumber: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  contentBase64?: string;
}

interface QuoteAttachmentCreateResponse {
  attachment: QuoteAttachmentItem;
}

export const quoteAttachmentCreate = api(
  // 50 MiB — base64 inflates bytes ~33%, so this allows raw files up to ~37 MiB.
  { expose: true, auth: false, method: "POST", path: "/quotes/:quoteNumber/attachments", bodyLimit: 50 * 1024 * 1024 },
  async (req: QuoteAttachmentCreateRequest): Promise<QuoteAttachmentCreateResponse> => {
    if (!req.fileName) {
      throw APIError.invalidArgument("fileName is required");
    }
    const attachment = await quoteAttachmentService.create(
      req.quoteNumber,
      req.fileName,
      req.fileSize ?? 0,
      req.fileType ?? "",
      req.contentBase64 ?? "",
    );
    return { attachment: attachment as unknown as QuoteAttachmentItem };
  },
);

interface QuoteAttachmentDeleteRequest {
  quoteNumber: string;
  attachmentId: string;
}

interface QuoteAttachmentDeleteResponse {
  ok: boolean;
}

export const quoteAttachmentDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/quotes/:quoteNumber/attachments/:attachmentId" },
  async (req: QuoteAttachmentDeleteRequest): Promise<QuoteAttachmentDeleteResponse> => {
    await quoteAttachmentService.delete(req.attachmentId);
    return { ok: true };
  },
);

// Streams raw file bytes. Inline only for allow-listed safe types; otherwise
// served as a download. Guards against IDOR via the owning quote number.
const INLINE_SAFE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
]);

export const quoteAttachmentContent = api.raw(
  { expose: true, auth: false, method: "GET", path: "/quotes/:quoteNumber/attachments/:id/content" },
  async (req, resp) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // [quotes, qn, attachments, id, content]
    const quoteNumber = decodeURIComponent(parts[1] ?? "");
    const id = parts[3] ?? "";

    const content = await quoteAttachmentService.getContent(id);
    if (!content || content.quoteNumber !== quoteNumber) {
      resp.writeHead(404, { "Content-Type": "text/plain" });
      resp.end("Not found");
      return;
    }

    const requestedDownload = url.searchParams.get("download") === "1";
    const canInline = !requestedDownload && INLINE_SAFE_TYPES.has(content.fileType);
    const contentType = canInline ? content.fileType : "application/octet-stream";
    const disposition = canInline ? "inline" : "attachment";
    const encodedName = encodeURIComponent(content.fileName);

    resp.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.buffer.length,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    });
    resp.end(content.buffer);
  },
);
