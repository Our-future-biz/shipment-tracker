-- Co-Loading Concept: what a shipment counted in the box on the day it was linked, and whether the
-- people who must act were told that a sailing's box is over its limit. Council Outlay 14, C4.
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "co_loading_sailing" ADD COLUMN IF NOT EXISTS "over_notified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "co_loading_sailing_shipment" ADD COLUMN IF NOT EXISTS "linked_weight_kg" numeric(12, 1);--> statement-breakpoint
ALTER TABLE "co_loading_sailing_shipment" ADD COLUMN IF NOT EXISTS "linked_volume_cbm" numeric(12, 3);
