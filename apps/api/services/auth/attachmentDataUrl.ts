// Largest document a noticeboard post accepts; the web app checks the same limit before uploading.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// `data:<type>[;param=value];base64,` — the type is what the browser reported for the file.
const DATA_URL_PREFIX = /^data:([\w.+-]+\/[\w.+-]+)?(?:;[\w-]+=[\w.+-]+)*;base64,/;
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]*={0,2}$/;

export interface AttachmentDataUrl {
  // Lower-cased MIME type from the data URL; empty when the browser gave none.
  fileType: string;
  // Decoded size in bytes.
  fileSize: number;
}

/**
 * Documents are stored as base64 data URLs and later handed back to readers' browsers,
 * so anything that is not one (a `javascript:` or `https:` URL, say) must never be saved.
 * Returns the type and size the content itself declares, or null when it is not a data URL.
 */
export function parseAttachmentDataUrl(fileData: string): AttachmentDataUrl | null {
  const prefix = DATA_URL_PREFIX.exec(fileData.slice(0, 512));
  if (!prefix) return null;
  const payload = fileData.slice(prefix[0].length);
  if (payload.length % 4 !== 0 || !BASE64_PAYLOAD.test(payload)) return null;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return { fileType: (prefix[1] ?? "").toLowerCase(), fileSize: Math.max(0, (payload.length / 4) * 3 - padding) };
}
