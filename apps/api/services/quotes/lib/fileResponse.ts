// Headers for serving a stored file to a browser. Only types that can't run script are shown
// inline; everything else is a download, sandboxed and never sniffed.

const INLINE_SAFE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"]);

export function fileHeaders(file: { fileName: string; fileType: string; size: number }, download: boolean): Record<string, string | number> {
  const inline = !download && INLINE_SAFE_TYPES.has(file.fileType);
  return {
    "Content-Type": inline ? file.fileType : "application/octet-stream",
    "Content-Length": file.size,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    "Cache-Control": "private, no-store",
  };
}
