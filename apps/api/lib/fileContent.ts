import type { ServerResponse } from "node:http";

// Raw file responses for the endpoints a browser opens directly (download links, previews).

// MIME types safe to render inline in the browser. Everything else (notably text/html,
// image/svg+xml, application/xml) is forced to download as an opaque binary, so an uploaded
// document can never run script on this origin (stored XSS).
export const INLINE_SAFE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
]);

export interface FileContent {
  fileName: string;
  fileType: string;
  buffer: Buffer;
}

/** Writes the file: inline for safe types unless a download was asked for, else as a download. */
export function writeFileResponse(resp: ServerResponse, file: FileContent, download: boolean): void {
  const canInline = !download && INLINE_SAFE_TYPES.has(file.fileType);
  resp.writeHead(200, {
    "Content-Type": canInline ? file.fileType : "application/octet-stream",
    "Content-Length": file.buffer.length,
    "Content-Disposition": `${canInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  });
  resp.end(file.buffer);
}

export function writeNotFound(resp: ServerResponse): void {
  resp.writeHead(404, { "Content-Type": "text/plain" });
  resp.end("Not found");
}
