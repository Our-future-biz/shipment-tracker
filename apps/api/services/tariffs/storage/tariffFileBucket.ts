import { Bucket } from "encore.dev/storage/objects";

// The suppliers' tariff files, kept as uploaded. Metadata (source_key, source_sha256,
// source_file_name) lives on the version row; the bytes live here. Private: served only through the
// authenticated GET /tariffs/rail/versions/:id/source endpoint.
export const tariffFileBucket = new Bucket("tariff-files");
