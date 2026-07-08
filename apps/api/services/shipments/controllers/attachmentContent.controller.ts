import { api } from "encore.dev/api";
import { attachmentService } from "../services/attachment.service";

// MIME types safe to render inline in the browser. Everything else (notably
// text/html, image/svg+xml, application/xml) is forced to download as an opaque
// binary to prevent stored-XSS from an uploaded document executing on this origin.
const INLINE_SAFE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
]);

// Streams the raw file bytes. Inline (viewable) only for allow-listed safe types;
// otherwise served as an attachment download.
// Path: /shipments/:shipmentId/attachments/:id/content
export const attachmentContent = api.raw(
  { expose: true, auth: false, method: "GET", path: "/shipments/:shipmentId/attachments/:id/content" },
  async (req, resp) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // [shipments, sid, attachments, id, content]
    const shipmentId = parts[1] ?? "";
    const id = parts[3] ?? "";

    const content = await attachmentService.getContent(id);
    // Reject if missing or if the id is used outside its owning shipment (IDOR).
    if (!content || content.shipmentId !== shipmentId) {
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
