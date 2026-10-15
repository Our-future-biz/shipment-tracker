import { Bucket } from "encore.dev/storage/objects";

// Consignment documents (POD, CMR, delivery notes), uploaded by users or by the haulier through
// the transport-order link. Metadata lives in trucking_document; the bytes live here under
// storage_key. Private: served only through the authenticated document endpoint.
export const truckingDocumentBucket = new Bucket("trucking-documents");
