const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

// Read a File's bytes as base64 (without the `data:...;base64,` prefix).
export function fileToBase64(file: File): Promise<string> {
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

// "1.4 MB" style size for file lists.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// URL for viewing (inline) or downloading a stored attachment's bytes.
export function attachmentContentUrl(shipmentId: string, attachmentId: string, download = false): string {
  return `${API_BASE}/shipments/${shipmentId}/attachments/${attachmentId}/content${download ? "?download=1" : ""}`;
}

export function quoteAttachmentContentUrl(quoteNumber: string, attachmentId: string, download = false): string {
  return `${API_BASE}/quotes/${encodeURIComponent(quoteNumber)}/attachments/${attachmentId}/content${download ? "?download=1" : ""}`;
}
