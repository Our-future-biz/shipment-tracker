CREATE TABLE "warehouse_gate_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"container" text DEFAULT '' NOT NULL,
	"tag" text DEFAULT '' NOT NULL,
	"file_name" text NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"file_type" text DEFAULT '' NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ALTER COLUMN "customs_status" SET DEFAULT 'Waiting For Commercial Paperwork';--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "freight_mode" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "load_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "commodity" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "stackable" boolean;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "dangerous_goods" boolean;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "customer_contact_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "transport_legs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "containers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "surveys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "sub_positions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "updated_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "warehouse_gate_file_created_at_idx" ON "warehouse_gate_file" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_gate_file_deleted_at_idx" ON "warehouse_gate_file" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_gate_file_company_id_idx" ON "warehouse_gate_file" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_gate_file_movement_idx" ON "warehouse_gate_file" USING btree ("movement_id");--> statement-breakpoint
-- The gate log adopts the shipments customs-status list; map rows written with the earlier Czech list.
UPDATE "warehouse_gate_movement" SET "customs_status" = CASE
  WHEN "customs_status" = 'Čeká na doklady' THEN 'Waiting For Commercial Paperwork'
  WHEN "customs_status" IN ('Propuštěno do volného oběhu', 'Vývoz propuštěn', 'Výstup potvrzen', 'Bez režimu — volný oběh') THEN 'Customs Cleared/Released'
  WHEN "customs_status" IN ('Podáno — MRN přiděleno', 'Celní kontrola', 'T1 otevřen', 'T1 ukončen — dočasné uskladnění', 'Celní sklad 71 00', 'Zadrženo') THEN 'Under Customs Clearance'
  ELSE "customs_status" END;
