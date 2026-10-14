import { api } from "encore.dev/api";
import { attachmentService } from "../services/attachment.service";
import { writeFileResponse, writeNotFound } from "../../../lib/fileContent";

// Streams the raw file bytes. Inline (viewable) only for allow-listed safe types;
// otherwise served as an attachment download.
// Path: /shipments/:shipmentId/attachments/:id/content?t=<token>[&download=1]
export const attachmentContent = api.raw(
  // Public by necessity: the browser opens this as a plain link, without the auth header.
  // Instead the link carries a short-lived signed token (AttachmentItem.contentUrl) naming
  // the file and the company; without a valid one nothing is served.
  { expose: true, auth: false, method: "GET", path: "/shipments/:shipmentId/attachments/:id/content" },
  async (req, resp) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // [shipments, sid, attachments, id, content]
    const file = await attachmentService.getContent(parts[1] ?? "", parts[3] ?? "", url.searchParams.get("t"));
    if (!file) {
      writeNotFound(resp);
      return;
    }
    writeFileResponse(resp, file, url.searchParams.get("download") === "1");
  },
);
