import { api } from "encore.dev/api";
import type { MaxLen, Min, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { quoteAttachmentService } from "../services/quoteAttachment.service";
import { fileHeaders } from "../lib/fileResponse";
import type { QuoteAttachmentItem } from "../interfaces/interfaces";

interface QuoteAttachmentListRequest {
  quoteNumber: string;
}

interface QuoteAttachmentListResponse {
  attachments: QuoteAttachmentItem[];
}

export const quoteAttachmentList = api(
  { expose: true, auth: true, method: "GET", path: "/quotes/:quoteNumber/attachments" },
  async (req: QuoteAttachmentListRequest): Promise<QuoteAttachmentListResponse> => {
    return { attachments: await quoteAttachmentService.list(req.quoteNumber, getAuthData()!.companyID) };
  },
);

interface QuoteAttachmentCreateRequest {
  quoteNumber: string;
  fileName: string & MinLen<1> & MaxLen<300>;
  fileSize: number & Min<0>;
  fileType: string & MaxLen<200>;
  contentBase64?: string;
}

interface QuoteAttachmentCreateResponse {
  attachment: QuoteAttachmentItem;
}

export const quoteAttachmentCreate = api(
  // 50 MiB — base64 inflates bytes ~33%, so this allows raw files up to ~37 MiB.
  { expose: true, auth: true, method: "POST", path: "/quotes/:quoteNumber/attachments", bodyLimit: 50 * 1024 * 1024 },
  async ({ quoteNumber, contentBase64, ...file }: QuoteAttachmentCreateRequest): Promise<QuoteAttachmentCreateResponse> => {
    const attachment = await quoteAttachmentService.create(quoteNumber, getAuthData()!.companyID, {
      ...file,
      contentBase64: contentBase64 ?? "",
    });
    return { attachment };
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
  { expose: true, auth: true, method: "DELETE", path: "/quotes/:quoteNumber/attachments/:attachmentId" },
  async (req: QuoteAttachmentDeleteRequest): Promise<QuoteAttachmentDeleteResponse> => {
    await quoteAttachmentService.delete(req.quoteNumber, req.attachmentId, getAuthData()!.companyID);
    return { ok: true };
  },
);

// Raw file bytes for a plain browser link (<a href>, no Authorization header). Access is the
// signed `?t=` token from the attachment's contentUrl: valid for an hour, for this one file.
export const quoteAttachmentContent = api.raw(
  { expose: true, auth: false, method: "GET", path: "/quotes/:quoteNumber/attachments/:id/content" },
  async (req, resp) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // [quotes, qn, attachments, id, content]
    const quoteNumber = decodeURIComponent(parts[1] ?? "");
    const id = parts[3] ?? "";

    const file = await quoteAttachmentService.getContent(quoteNumber, id, url.searchParams.get("t"));
    if (!file) {
      resp.writeHead(404, { "Content-Type": "text/plain" });
      resp.end("Not found");
      return;
    }
    const download = url.searchParams.get("download") === "1";
    resp.writeHead(200, fileHeaders({ fileName: file.fileName, fileType: file.fileType, size: file.buffer.length }, download));
    resp.end(file.buffer);
  },
);
