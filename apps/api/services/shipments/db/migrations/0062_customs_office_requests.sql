CREATE TABLE "customs_office_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"from_office" text NOT NULL,
	"to_office" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"requested_by_name" text DEFAULT '' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" uuid,
	"decided_by_name" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"comment" text DEFAULT '' NOT NULL,
	"answer_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "customs_office_request_company_id_idx" ON "customs_office_request" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "customs_office_request_shipment_id_idx" ON "customs_office_request" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "customs_office_request_requested_by_idx" ON "customs_office_request" USING btree ("company_id","requested_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customs_office_request_one_pending_unique" ON "customs_office_request" USING btree ("company_id","shipment_id") WHERE status = 'pending' AND deleted_at IS NULL;