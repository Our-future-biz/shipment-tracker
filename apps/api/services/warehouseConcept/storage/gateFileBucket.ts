import { Bucket } from "encore.dev/storage/objects";

// Object storage for gate movement photos and documents. Metadata lives in the
// warehouse_gate_file table; the bytes live here under `storageKey`.
export const gateFileBucket = new Bucket("warehouse-gate-files");
