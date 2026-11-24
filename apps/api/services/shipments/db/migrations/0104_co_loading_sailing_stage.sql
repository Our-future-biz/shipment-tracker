-- Co-Loading Concept: a sailing's stage, set by hand (open, closed for cargo, departed, arrived,
-- devanned), and the reason a shipment was linked after the sailing was closed for cargo.
-- Council Outlay 14, C3.
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "co_loading_sailing" ADD COLUMN IF NOT EXISTS "stage" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "co_loading_sailing_shipment" ADD COLUMN IF NOT EXISTS "linked_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "co_loading_sailing" DROP CONSTRAINT IF EXISTS "co_loading_sailing_stage_check";--> statement-breakpoint
ALTER TABLE "co_loading_sailing" ADD CONSTRAINT "co_loading_sailing_stage_check" CHECK ("co_loading_sailing"."stage" IN ('open', 'closed', 'departed', 'arrived', 'devanned'));
