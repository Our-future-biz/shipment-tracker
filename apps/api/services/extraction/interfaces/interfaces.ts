export interface ExtractionResult {
  extracted: Record<string, string>;
  fieldCount: number;
  method: "text" | "vision";
  fileName: string;
}

export interface PrepareResult {
  sessionId: string;
  pageCount: number;
  classification: Record<string, number>;
  pages: Array<{ pageNum: number; type: string }>;
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
