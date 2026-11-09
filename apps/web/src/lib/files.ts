// Read a File's (or any Blob's) bytes as base64 (without the `data:...;base64,` prefix).
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Read a File as a full base64 data URL (`data:<type>;base64,...`).
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Save a data URL to the user's disk under the given name.
export function downloadDataUrl(dataUrl: string, fileName: string) {
  // Stored content is untrusted: any other kind of URL would be opened (or run) instead of saved.
  if (!dataUrl.startsWith("data:")) throw new Error("Not a data URL");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}

// A base64 data URL's bytes as a Blob of the given type. Decoded here, as the app's security policy
// (connect-src in next.config.ts) does not let fetch() read a data: URL.
export function dataUrlToBlob(dataUrl: string, type: string): Blob {
  const match = /^data:[^,]*;base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error("Not a base64 data URL");
  return new Blob([Uint8Array.from(atob(match[1]!), (c) => c.charCodeAt(0))], { type });
}

// "1.4 MB" style size for file lists.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A file the server sent as base64, as a data URL to save to disk (`fallbackType` when it names none). */
export function fileDataUrl(file: { fileBase64: string; contentType?: string | null }, fallbackType = "application/octet-stream"): string {
  return `data:${file.contentType || fallbackType};base64,${file.fileBase64}`;
}
