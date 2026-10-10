ALTER TABLE "shipment" ADD COLUMN "principal_party_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "principal_party" text DEFAULT '' NOT NULL;