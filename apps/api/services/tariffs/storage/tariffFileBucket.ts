import { Bucket } from "encore.dev/storage/objects";

// The suppliers' tariff files, kept as uploaded, under their company's own prefix
// ("<companyId>/<uuid>/<file name>"). Metadata (source_key, source_sha256, source_file_name) lives on
// the version row; the bytes live here. Private: served only through the authenticated
// GET /tariffs/{rail,collections,ocean}/versions/:versionId/source endpoints, which find the key on a
// version of the caller's company.
export const tariffFileBucket = new Bucket("tariff-files");
