export interface ExtractionResult {
  extracted: Record<string, string>;
  fieldCount: number;
  method: "text" | "vision";
  fileName: string;
}

/** One uploaded file of a pre-alert. */
export interface PipelineFile {
  fileBase64: string;
  fileName: string;
}

export interface PrepareResult {
  sessionId: string;
  pageCount: number;
  classification: Record<string, number>;
  pages: Array<{ pageNum: number; fileName: string; type: string }>;
  /** Every uploaded file with the number of pages it contributed. */
  files: Array<{ fileName: string; pageCount: number }>;
  /** All file names, comma separated. */
  fileName: string;
}

export interface ExtractMblResult {
  mblInfo: Record<string, string> | null;
  message?: string;
}

export interface ExtractHblResult {
  shipments: Record<string, string>[];
  batchIndex: number;
  totalBatches: number;
  totalExtracted: number;
  done: boolean;
}
