CREATE TABLE "warehouse_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"job" text DEFAULT '' NOT NULL,
	"against" text DEFAULT '' NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"raised" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Under review' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_container" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"movement_id" uuid,
	"number" text NOT NULL,
	"equipment" text DEFAULT '' NOT NULL,
	"seal" text DEFAULT '' NOT NULL,
	"pieces" integer,
	"packages" text DEFAULT '' NOT NULL,
	"weight_kg" double precision,
	"cbm" double precision,
	"direction" text DEFAULT 'Unloading' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"carrier" text DEFAULT '' NOT NULL,
	"master_job" text DEFAULT '' NOT NULL,
	"discharge_port" text DEFAULT '' NOT NULL,
	"arrived_at" text DEFAULT '' NOT NULL,
	"houses" integer,
	"dock_slot" text DEFAULT '' NOT NULL,
	"schedule_status" text DEFAULT 'Scheduled' NOT NULL,
	"yard_state" text DEFAULT '' NOT NULL,
	"gated_in" text DEFAULT '' NOT NULL,
	"gated_out" text DEFAULT '' NOT NULL,
	"detention_expiry" text DEFAULT '' NOT NULL,
	"yard_status" text DEFAULT '' NOT NULL,
	"tare_kg" double precision,
	"cargo_kg" double precision,
	"vgm_method" text DEFAULT '' NOT NULL,
	"vgm_declared_by" text DEFAULT '' NOT NULL,
	"vgm_declared_at" text DEFAULT '' NOT NULL,
	"vgm_status" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_dock_slot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"dock" text NOT NULL,
	"direction" text DEFAULT 'IN' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"party" text DEFAULT '' NOT NULL,
	"vehicle" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Booked' NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Available' NOT NULL,
	"operator" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_saved_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"frequency" text DEFAULT '' NOT NULL,
	"format" text DEFAULT 'XLSX' NOT NULL,
	"distribution" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"shift" text DEFAULT '' NOT NULL,
	"area" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "warehouse_claim_created_at_idx" ON "warehouse_claim" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_claim_deleted_at_idx" ON "warehouse_claim" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_claim_company_id_idx" ON "warehouse_claim" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_container_created_at_idx" ON "warehouse_container" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_container_deleted_at_idx" ON "warehouse_container" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_container_company_id_idx" ON "warehouse_container" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_container_movement_idx" ON "warehouse_container" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "warehouse_dock_slot_created_at_idx" ON "warehouse_dock_slot" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_dock_slot_deleted_at_idx" ON "warehouse_dock_slot" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_dock_slot_company_id_idx" ON "warehouse_dock_slot" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_equipment_created_at_idx" ON "warehouse_equipment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_equipment_deleted_at_idx" ON "warehouse_equipment" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_equipment_company_id_idx" ON "warehouse_equipment" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_saved_report_created_at_idx" ON "warehouse_saved_report" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_saved_report_deleted_at_idx" ON "warehouse_saved_report" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_saved_report_company_id_idx" ON "warehouse_saved_report" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_staff_created_at_idx" ON "warehouse_staff" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_staff_deleted_at_idx" ON "warehouse_staff" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_staff_company_id_idx" ON "warehouse_staff" USING btree ("company_id");--> statement-breakpoint
-- Containers recorded on a position (number + type) move into the container register.
INSERT INTO "warehouse_container" ("company_id", "movement_id", "number", "equipment", "direction", "created_at", "updated_at")
SELECT m."company_id", m."id", c->>'number', COALESCE(c->>'type', ''),
       CASE WHEN m."handling" = 'Export' THEN 'Loading' ELSE 'Unloading' END, m."created_at", now()
FROM "warehouse_gate_movement" m, jsonb_array_elements(m."containers") c
WHERE COALESCE(c->>'number', '') <> '';--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" DROP COLUMN "containers";