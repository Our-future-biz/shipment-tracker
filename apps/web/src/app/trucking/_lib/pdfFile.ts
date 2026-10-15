import type { TruckingFile } from "@/hooks/useTruckingConsignments";
import { downloadDataUrl } from "@/lib/files";
import { fileDataUrl } from "./tariffUpload";

/** Saves a PDF the server made, under its own name or the given one. */
export const savePdf = (file: TruckingFile, fallbackName: string) =>
  downloadDataUrl(fileDataUrl({ ...file, contentType: file.contentType || "application/pdf" }), file.fileName || fallbackName);
