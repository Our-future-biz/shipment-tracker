ALTER TABLE "shipment_note" ADD COLUMN "details" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_note" ADD COLUMN "due_date" date;