CREATE TABLE "cargo_dimension" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"container_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"pieces" text DEFAULT '' NOT NULL,
	"length_cm" text DEFAULT '' NOT NULL,
	"width_cm" text DEFAULT '' NOT NULL,
	"height_cm" text DEFAULT '' NOT NULL,
	"weight_per_pc_kg" text DEFAULT '' NOT NULL,
	"package_type" text DEFAULT '' NOT NULL,
	"stackable" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cargo_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"container_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"cargo_description" text DEFAULT '' NOT NULL,
	"hs_code" text DEFAULT '' NOT NULL,
	"pieces" text DEFAULT '' NOT NULL,
	"package_type" text DEFAULT '' NOT NULL,
	"gross_weight" text DEFAULT '' NOT NULL,
	"commercial_invoice_value" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cargo_dimension_created_at_idx" ON "cargo_dimension" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cargo_dimension_deleted_at_idx" ON "cargo_dimension" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cargo_dimension_company_id_idx" ON "cargo_dimension" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cargo_dimension_shipment_id_idx" ON "cargo_dimension" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "cargo_dimension_container_id_idx" ON "cargo_dimension" USING btree ("container_id");--> statement-breakpoint
CREATE INDEX "cargo_item_created_at_idx" ON "cargo_item" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cargo_item_deleted_at_idx" ON "cargo_item" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cargo_item_company_id_idx" ON "cargo_item" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cargo_item_shipment_id_idx" ON "cargo_item" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "cargo_item_container_id_idx" ON "cargo_item" USING btree ("container_id");--> statement-breakpoint
ALTER TABLE "shipment" DROP COLUMN "dimensions";--> statement-breakpoint
ALTER TABLE "shipment" DROP COLUMN "cargo_items";