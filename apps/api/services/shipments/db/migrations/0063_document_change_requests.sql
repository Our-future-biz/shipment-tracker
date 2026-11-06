CREATE TABLE "document_change_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"document_type" text DEFAULT '' NOT NULL,
	"new_file_name" text NOT NULL,
	"new_file_type" text DEFAULT '' NOT NULL,
	"new_file_size" integer DEFAULT 0 NOT NULL,
	"new_storage_key" text NOT NULL,
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
CREATE INDEX "document_change_request_company_id_idx" ON "document_change_request" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "document_change_request_shipment_id_idx" ON "document_change_request" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "document_change_request_requested_by_idx" ON "document_change_request" USING btree ("company_id","requested_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_change_request_one_pending_unique" ON "document_change_request" USING btree ("company_id","attachment_id") WHERE status = 'pending' AND deleted_at IS NULL;