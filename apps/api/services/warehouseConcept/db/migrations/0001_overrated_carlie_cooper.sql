CREATE TABLE "warehouse_section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" text NOT NULL,
	"section" text NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE INDEX "warehouse_section_created_at_idx" ON "warehouse_section" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_section_deleted_at_idx" ON "warehouse_section" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_section_shipment_id_idx" ON "warehouse_section" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_section_shipment_section_idx" ON "warehouse_section" USING btree ("shipment_id","section");