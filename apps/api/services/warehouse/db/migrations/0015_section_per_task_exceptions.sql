CREATE TABLE "warehouse_exception" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"task_id" uuid,
	"type" text NOT NULL,
	"pieces" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"container" text DEFAULT '' NOT NULL,
	"survey_phase" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text DEFAULT '' NOT NULL,
	"resolution_note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
DROP INDEX "warehouse_section_shipment_section_idx";--> statement-breakpoint
ALTER TABLE "warehouse_section" ALTER COLUMN "shipment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_section" ADD COLUMN "task_id" uuid;--> statement-breakpoint
-- Sections belong to the warehouse position (task) from now on: live rows of a shipment that has a live position get its task_id. The pick-up section stays keyed to the shipment (Shipments enters it). Hand-added after the generated statements that add the column.
UPDATE "warehouse_section" s
SET "task_id" = t."id", "updated_at" = now()
FROM "warehouse_task" t
WHERE t."company_id" = s."company_id"
  AND t."deleted_at" IS NULL
  AND t."shipment_id" IS NOT NULL
  AND t."shipment_id"::text = s."shipment_id"
  AND s."section" <> 'pickup'
  AND s."task_id" IS NULL
  AND s."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_exception_created_at_idx" ON "warehouse_exception" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_exception_deleted_at_idx" ON "warehouse_exception" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_exception_company_id_idx" ON "warehouse_exception" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_exception_movement_idx" ON "warehouse_exception" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "warehouse_exception_open_idx" ON "warehouse_exception" USING btree ("company_id","movement_id") WHERE status = 'open' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_section_task_id_idx" ON "warehouse_section" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_section_company_task_section_unique" ON "warehouse_section" USING btree ("company_id","task_id","section") WHERE deleted_at IS NULL AND task_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_section_company_shipment_section_unique" ON "warehouse_section" USING btree ("company_id","shipment_id","section") WHERE deleted_at IS NULL AND task_id IS NULL;