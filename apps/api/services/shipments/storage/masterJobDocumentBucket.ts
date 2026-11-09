import { Bucket } from "encore.dev/storage/objects";

// Object storage for master job document bytes, apart from the shipments' bucket. Metadata lives in
// the master_job_document table; the bytes live here under `storageKey` (`<masterJobId>/<uuid>`).
export const masterJobDocumentBucket = new Bucket("master-job-documents");
