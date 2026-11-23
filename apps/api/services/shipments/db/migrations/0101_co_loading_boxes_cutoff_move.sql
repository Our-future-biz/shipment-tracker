-- Co-Loading Concept: how many containers a sailing has, its cut-off day, and where a shipment
-- moved to another sailing went, with the reason. Council Outlay 12, decisions D15 to D17.
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "co_loading_sailing" ADD COLUMN IF NOT EXISTS "container_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "co_loading_sailing" ADD COLUMN IF NOT EXISTS "cutoff_date" date;--> statement-breakpoint
ALTER TABLE "co_loading_sailing_shipment" ADD COLUMN IF NOT EXISTS "moved_to_sailing_id" uuid;--> statement-breakpoint
ALTER TABLE "co_loading_sailing_shipment" ADD COLUMN IF NOT EXISTS "removed_note" text DEFAULT '' NOT NULL;
