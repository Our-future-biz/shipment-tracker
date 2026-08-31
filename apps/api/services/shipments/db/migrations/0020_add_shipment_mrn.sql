-- Customs Movement Reference Number, shown on the Customs tab.
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "mrn" text DEFAULT '' NOT NULL;
