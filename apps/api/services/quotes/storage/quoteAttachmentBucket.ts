import { Bucket } from "encore.dev/storage/objects";

// Object storage for quote document bytes. Metadata lives in the
// quote_attachment table; the bytes live here under `storageKey`.
export const quoteAttachmentBucket = new Bucket("quote-attachments");
