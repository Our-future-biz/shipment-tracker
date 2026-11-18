-- Shipments → Managers step 3 (Council Outlay 11, 18 Nov 2026), what a manager does:
--   shipment_release_request   a user asks a manager to release a job the prepayment stop holds (the House BoL, or
--                              Warehouse Released); a manager - not the one who asked - approves or rejects. Approved,
--                              it is a pass used once (used_at, used_by) by the release it lets through, which is then
--                              recorded as an override (shipment_release_override). closed = the job was released
--                              another way, while it waited or before its approval was used. At most one waits per
--                              shipment and thing asked.
--   shipment_cutoff_dismissal  a missed cut-off (Closing, VGM, SI, AMS, ISF) a manager dismissed with a reason, for the
--                              date it had then; taken back = deleted_at. One live per shipment, cut-off and date.
-- And two indexes for reads Shipments → Managers polls: the company's history since a day (shipment_audit), and the
-- documents approved for customs since a day (shipment_attachment, approved ones only). Building the first one holds
-- writes to shipment_audit for as long as it takes: on a large table, run the migration at a quiet hour.
-- No existing column or row is changed. Safe to run again.
CREATE TABLE IF NOT EXISTS "shipment_cutoff_dismissal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"cutoff" text NOT NULL,
	"cutoff_date" date NOT NULL,
	"reason" text NOT NULL,
	"dismissed_by_id" uuid NOT NULL,
	"dismissed_by_name" text DEFAULT '' NOT NULL,
	CONSTRAINT "shipment_cutoff_dismissal_cutoff_check" CHECK ("shipment_cutoff_dismissal"."cutoff" IN ('closingDate', 'vgmClosing', 'siClosing', 'amsDeadline', 'isfDeadline'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipment_release_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"what" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"requested_by_name" text DEFAULT '' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" uuid,
	"decided_by_name" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"comment" text DEFAULT '' NOT NULL,
	"answer_seen_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"used_by_id" uuid,
	"used_by_name" text DEFAULT '' NOT NULL,
	CONSTRAINT "shipment_release_request_what_check" CHECK ("shipment_release_request"."what" IN ('house_bol', 'warehouse')),
	CONSTRAINT "shipment_release_request_status_check" CHECK ("shipment_release_request"."status" IN ('pending', 'approved', 'rejected', 'closed'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shipment_cutoff_dismissal" ADD CONSTRAINT "shipment_cutoff_dismissal_shipment_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shipment_release_request" ADD CONSTRAINT "shipment_release_request_shipment_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_cutoff_dismissal_company_id_idx" ON "shipment_cutoff_dismissal" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_cutoff_dismissal_shipment_id_idx" ON "shipment_cutoff_dismissal" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_cutoff_dismissal_live_unique" ON "shipment_cutoff_dismissal" USING btree ("company_id","shipment_id","cutoff","cutoff_date") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_release_request_company_id_idx" ON "shipment_release_request" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_release_request_shipment_id_idx" ON "shipment_release_request" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_release_request_requested_by_idx" ON "shipment_release_request" USING btree ("company_id","requested_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_release_request_one_pending_unique" ON "shipment_release_request" USING btree ("company_id","shipment_id","what") WHERE status = 'pending' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_attachment_approved_reviewed_idx" ON "shipment_attachment" USING btree ("company_id","customs_reviewed_at") WHERE customs_status = 'approved';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_audit_company_changed_at_idx" ON "shipment_audit" USING btree ("company_id","changed_at");
