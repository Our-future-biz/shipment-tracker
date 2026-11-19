-- Shipments → Managers review fixes (Council Outlay 11, 19 Nov 2026), the requests to release before payment:
--   a closed request keeps the manager's comment - closing it no longer writes "Released without it" over the
--   reason they approved it with - and the closing has fields of its own: when (closed_at), why (closed_why:
--   released another way, or withdrawn), and, withdrawn, by whom (closed_by_id, closed_by_name) and why
--   (close_reason). Whoever asked may now withdraw a request still waiting, and a manager an approval nobody used.
-- The requests closed before this were all closed by a release made another way: they get closed_at from their
-- last write and closed_why 'released', and the app's own words "Released without it" in their comment are taken
-- out (the manager's reason they replaced is in the job's history). Safe to run again.
ALTER TABLE "shipment_release_request" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_release_request" ADD COLUMN IF NOT EXISTS "closed_why" text;--> statement-breakpoint
ALTER TABLE "shipment_release_request" ADD COLUMN IF NOT EXISTS "closed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment_release_request" ADD COLUMN IF NOT EXISTS "closed_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_release_request" ADD COLUMN IF NOT EXISTS "close_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_release_request" DROP CONSTRAINT IF EXISTS "shipment_release_request_closed_why_check";--> statement-breakpoint
ALTER TABLE "shipment_release_request" ADD CONSTRAINT "shipment_release_request_closed_why_check" CHECK ("shipment_release_request"."closed_why" IS NULL OR "shipment_release_request"."closed_why" IN ('released', 'withdrawn'));--> statement-breakpoint
UPDATE "shipment_release_request"
SET "closed_at" = "updated_at", "closed_why" = 'released', "comment" = CASE WHEN "comment" = 'Released without it' THEN '' ELSE "comment" END
WHERE "status" = 'closed' AND "closed_at" IS NULL;
