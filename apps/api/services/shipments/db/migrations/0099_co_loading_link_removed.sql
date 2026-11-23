-- Co-Loading Concept: who took a shipment off a sailing, and why ("removed" by hand,
-- "shipment_deleted" when the shipment itself was deleted). Council Outlay 12, decision D13.
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "co_loading_sailing_shipment" ADD COLUMN IF NOT EXISTS "removed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "co_loading_sailing_shipment" ADD COLUMN IF NOT EXISTS "removed_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "co_loading_sailing_shipment" ADD COLUMN IF NOT EXISTS "removed_reason" text DEFAULT '' NOT NULL;
