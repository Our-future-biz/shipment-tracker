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

// URL for viewing (inline) or downloading a stored attachment's bytes.
export function attachmentContentUrl(shipmentId: string, attachmentId: string, download = false): string {
  return `${API_BASE}/shipments/${shipmentId}/attachments/${attachmentId}/content${download ? "?download=1" : ""}`;
}

export function quoteAttachmentContentUrl(quoteNumber: string, attachmentId: string, download = false): string {
  return `${API_BASE}/quotes/${encodeURIComponent(quoteNumber)}/attachments/${attachmentId}/content${download ? "?download=1" : ""}`;
}
