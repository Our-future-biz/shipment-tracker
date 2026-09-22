-- Who uploaded a document. The Documents and Customs tabs showed a hardcoded
-- "You" for every file because the uploader was never recorded.
-- Null on rows created before this migration — those render as "Unknown".
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "uploaded_by_id" uuid;
