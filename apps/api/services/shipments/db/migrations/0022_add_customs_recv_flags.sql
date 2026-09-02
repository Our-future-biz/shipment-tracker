-- Manual override of the "document received" ticks on the Customs screen.
-- Empty string means: follow the shipment's uploaded documents automatically.
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "cs_recv_invoice" text DEFAULT '' NOT NULL;
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "cs_recv_packing" text DEFAULT '' NOT NULL;
