CREATE TABLE "master_job_container" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"master_job_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"container_number" text DEFAULT '' NOT NULL,
	"seal_number" text DEFAULT '' NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"shipment_ids" uuid[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "freight_mode" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "trade_direction" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "incoterm_origin" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "incoterm_destination" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "booking_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "closing_date" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "destination" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "shipper" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "shipper_id" uuid;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "consignee" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "consignee_id" uuid;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "load_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "service_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "shipping_line" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "pol" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "pod" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "estimated_departure" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "estimated_arrival" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "actual_departure" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "actual_arrival" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "eta_warehouse" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "warehouse_received_date" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "release_depot" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "redelivery_reference" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "redelivery_depot" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "supplier_pic" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "master_bol_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "master_bol_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "vessel" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "voyage" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "master_job_container_created_at_idx" ON "master_job_container" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "master_job_container_deleted_at_idx" ON "master_job_container" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "master_job_container_company_id_idx" ON "master_job_container" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "master_job_container_master_job_id_idx" ON "master_job_container" USING btree ("master_job_id");