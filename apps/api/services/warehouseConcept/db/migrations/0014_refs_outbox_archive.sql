CREATE TABLE "warehouse_shipment_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"stamp" text DEFAULT '' NOT NULL,
	"payload" jsonb NOT NULL,
	"acting_user_id" text NOT NULL,
	"acting_role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouse_ref_counter" (
	"company_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_ref_counter_company_id_year_pk" PRIMARY KEY("company_id","year")
);
--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "archived_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "archive_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "shipment_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_section" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "warehouse_shipment_outbox_created_at_idx" ON "warehouse_shipment_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_shipment_outbox_deleted_at_idx" ON "warehouse_shipment_outbox" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_shipment_outbox_company_id_idx" ON "warehouse_shipment_outbox" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_shipment_outbox_due_idx" ON "warehouse_shipment_outbox" USING btree ("next_attempt_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "warehouse_shipment_outbox_shipment_idx" ON "warehouse_shipment_outbox" USING btree ("shipment_id","created_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "warehouse_shipment_outbox_movement_idx" ON "warehouse_shipment_outbox" USING btree ("movement_id");