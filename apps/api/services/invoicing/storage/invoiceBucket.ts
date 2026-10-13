import { Bucket } from "encore.dev/storage/objects";

// PDFs of issued invoices and credit notes. Metadata (pdf_key, pdf_sha256) lives on the
// invoice row; the bytes live here. Private: served only through the authenticated
// GET /invoices/:invoiceId/pdf endpoint, never by a public URL.
export const invoiceBucket = new Bucket("invoice-documents");
