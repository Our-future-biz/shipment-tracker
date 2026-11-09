import type { PreviewSource } from "@/hooks/useFilePreview";
import type { TruckingFile } from "@/hooks/useTruckingConsignments";

// Trucking files (documents, exception photos, a haulier's invoice) come as base64 inside JSON behind
// the login, so the app's preview (hooks/useFilePreview) gets them through a loader.

/** A file the server sent, as a Blob of the type the server read from its bytes. */
export const truckingFileBlob = (file: TruckingFile): Blob =>
  new Blob([Uint8Array.from(atob(file.fileBase64), (c) => c.charCodeAt(0))], { type: file.contentType || "application/octet-stream" });

/** A file for the preview: fetched when it is opened, shown under the name the screen lists. */
export const truckingFileSource = (fileName: string, fetchFile: () => Promise<TruckingFile>): PreviewSource => ({
  fileName,
  load: async () => truckingFileBlob(await fetchFile()),
});
