-- Document classification + customs review, used by the Documents and Customs tabs.
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "document_type" text DEFAULT '' NOT NULL;
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "customs_status" text DEFAULT '' NOT NULL;
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "customs_note" text DEFAULT '' NOT NULL;
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "customs_reviewed_at" timestamp with time zone;
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "customs_reviewed_by_id" uuid;
