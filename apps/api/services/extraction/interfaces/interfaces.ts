import type { MinLen } from "encore.dev/validate";

export interface ExtractionResult {
  extracted: Record<string, string>;
  fieldCount: number;
  method: "text" | "vision";
  fileName: string;
}

/** One uploaded file of a pre-alert. */
export interface PipelineFile {
  fileBase64: string & MinLen<1>;
  fileName: string & MinLen<1>;
}

export interface PrepareResult {
  sessionId: string;
  pageCount: number;
  classification: Record<string, number>;
  pages: Array<{ pageNum: number; fileName: string; type: string }>;
  /** Every uploaded file with the number of pages it contributed. */
  files: Array<{ fileName: string; pageCount: number }>;
  /** Distinct House B/Ls found — the number of shipments the batch will create. */
  hblCount: number;
  /** All file names, comma separated. */
  fileName: string;
}

export interface ExtractMblResult {
  mblInfo: Record<string, string> | null;
  message?: string;
}

/** The pages of one House B/L, cut out of the pre-alert as its own file. */
export interface HblDocument {
  /** Suggested name: the House B/L number as printed (characters a file name can't hold become "-"). */
  fileName: string;
  fileType: string;
  fileSize: number;
  fileBase64: string;
  /** The uploaded file the pages came from, and their page numbers in it. */
  sourceFileName: string;
  pages: number[];
}

export interface ExtractHblResult {
  shipments: Record<string, string>[];
  /** The House B/L's own pages for each shipment, in the same order; null when they couldn't be cut out. */
  documents: (HblDocument | null)[];
  batchIndex: number;
  totalBatches: number;
  totalExtracted: number;
  done: boolean;
}
