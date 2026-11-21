import type { MinLen } from "encore.dev/validate";

/** One charge row of an invoice, as read. */
export interface InvoiceLineRead {
  /** The B/L number on the row; empty when it names none */
  bl: string;
  item: string;
  /** The row's final amount as a decimal ("399.60"); a credit is negative */
  amount: string;
  /** The row's own currency; empty when it is the invoice's */
  currency: string;
  /** The charge suggested for the row; empty when none fits */
  serviceType: string;
}

export interface ExtractionResult {
  extracted: Record<string, string>;
  fieldCount: number;
  method: "text" | "vision";
  fileName: string;
  /** An invoice's charge rows, when it lists them */
  invoiceLines?: InvoiceLineRead[];
  /** The invoice's charge rows ran past what one reading holds: only its header fields were read */
  invoiceLinesSkipped?: boolean;
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

/** A shipment or master job of the company that a reading's B/L is on already. */
export interface ReadingMadeAlready {
  id: string;
  /** The shipment's job number, or the master job's MCZ number. */
  number: string;
}

export interface ExtractMblResult {
  mblInfo: Record<string, string> | null;
  message?: string;
  /** The company's live master job that has this Master B/L already: the pre-alert's houses go to it. */
  existingMasterJob?: ReadingMadeAlready | null;
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
  /**
   * For each shipment, in the same order: the company's live shipment that has its House B/L
   * already (it is not created again), or null. Looked up on every answer, so a house created
   * since the batch was read shows too.
   */
  existing?: (ReadingMadeAlready | null)[];
  /**
   * When no Master B/L number was read (no Master B/L page): the company's live master job of the
   * Master B/L the houses read so far agree on, or null. The pre-alert's houses go to it.
   */
  existingMasterJob?: ReadingMadeAlready | null;
  batchIndex: number;
  totalBatches: number;
  totalExtracted: number;
  done: boolean;
}
