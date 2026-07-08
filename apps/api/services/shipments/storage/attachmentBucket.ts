import { Bucket } from "encore.dev/storage/objects";

// Object storage for shipment document bytes. Metadata lives in the
// shipment_attachment table; the bytes live here under `storageKey`.
export const attachmentBucket = new Bucket("shipment-attachments");
