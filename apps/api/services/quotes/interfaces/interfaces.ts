// Plain interfaces for controllers. Never import Drizzle table types here.

export interface QuoteItem {
  id: string;
  quoteNumber: string;
  /**
   * The quote's fields. Two shapes share this column: sales quotes (QCZ…, keyed by field name
   * like `quoteStatus`, `buyingLines`) and older quotes keyed by column label ("POL", …), so it
   * stays an open object here; each client reads the shape it wrote.
   */
  data: unknown;
  terms: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteAttachmentItem {
  id: string;
  quoteNumber: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
  /**
   * Where the file can be opened, relative to the API base URL. Carries a signed token valid
   * for an hour, so a plain link works without the auth header; add `&download=1` to download.
   */
  contentUrl: string;
}

export interface QuotePage {
  pagination: {
    total: number;
    offset: number;
    limit: number;
  };
  data: QuoteItem[];
}
