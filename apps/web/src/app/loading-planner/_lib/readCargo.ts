import type { lib } from "@/lib/api/client";
import type { DraftLine } from "./cargoForm";

// What the AI reader found in a document, as lines of the plan's cargo table.

/** The files the reader takes, as the file dialog filters them. */
export const READ_FILE_TYPES = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".xlsx", ".csv", ".txt"];
export const MAX_READ_FILE_MB = 20;
/** The AI reader takes no larger picture. */
export const MAX_READ_PICTURE_MB = 5;
const PICTURES = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

/** Why a chosen file cannot be sent to the reader, or null. */
export function readFileProblem(file: { name: string; size: number }): string | null {
  const ext = `.${file.name.toLowerCase().split(".").pop() ?? ""}`;
  if (ext === ".xls") return "Old Excel files (.xls) cannot be read. Save the workbook as .xlsx and choose it again.";
  if (!READ_FILE_TYPES.includes(ext)) return "This kind of file cannot be read. Choose a PDF, a picture, an .xlsx workbook, or a .csv or .txt file.";
  if (file.size > MAX_READ_FILE_MB * 1024 * 1024) return `The file is larger than ${MAX_READ_FILE_MB} MB.`;
  if (PICTURES.includes(ext) && file.size > MAX_READ_PICTURE_MB * 1024 * 1024) return `A picture may be at most ${MAX_READ_PICTURE_MB} MB. Make it smaller, or save it as a PDF.`;
  if (file.size === 0) return "The file is empty.";
  return null;
}

/** A line with every figure the planner needs. */
export const isReadLineComplete = (line: lib.CargoLineRead): boolean =>
  line.lengthMm !== null && line.widthMm !== null && line.heightMm !== null && line.weightKg !== null && line.colli !== null;

/**
 * The lines read, as cargo lines of the plan. What the document did not give stays empty, never a
 * guess. Stackable is ticked only when the document says the piece is.
 */
export const draftsFromReading = (lines: lib.CargoLineRead[], newId: () => string): DraftLine[] =>
  lines.map((line) => ({
    id: newId(),
    name: line.name,
    lengthMm: line.lengthMm,
    widthMm: line.widthMm,
    heightMm: line.heightMm,
    weightKg: line.weightKg,
    colli: line.colli,
    canTurn: true,
    stackable: line.stackable === true,
  }));
