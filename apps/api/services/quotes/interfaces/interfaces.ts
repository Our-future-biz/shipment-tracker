export interface QuoteItem {
  id: string;
  quoteNumber: string;
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
  storageKey: string;
  createdAt: string;
}
