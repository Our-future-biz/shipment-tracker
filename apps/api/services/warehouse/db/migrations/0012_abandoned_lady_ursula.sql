CREATE TABLE "warehouse_bonded_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"mrn" text NOT NULL,
	"job" text DEFAULT '' NOT NULL,
	"consignee" text DEFAULT '' NOT NULL,
	"procedure" text DEFAULT '71 00 — customs warehousing' NOT NULL,
	"entry_date" text DEFAULT '' NOT NULL,
	"pieces" integer DEFAULT 0 NOT NULL,
	"weight_kg" double precision DEFAULT 0 NOT NULL,
	"customs_value" text DEFAULT '' NOT NULL,
	"discharge" text DEFAULT '' NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_stock_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"job" text NOT NULL,
	"customer" text DEFAULT '' NOT NULL,
	"shipper" text DEFAULT '' NOT NULL,
	"pod" text DEFAULT '' NOT NULL,
	"pieces" integer DEFAULT 0 NOT NULL,
	"package_type" text DEFAULT '' NOT NULL,
	"weight_kg" double precision DEFAULT 0 NOT NULL,
	"cbm" double precision DEFAULT 0 NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"received_at" text NOT NULL,
	"free_days" integer DEFAULT 7 NOT NULL,
	"customs" text DEFAULT 'Free circulation' NOT NULL,
	"status" text DEFAULT 'Available' NOT NULL,
	"consol" text DEFAULT '' NOT NULL,
	"marks" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_stock_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"at" text NOT NULL,
	"type" text NOT NULL,
	"job" text DEFAULT '' NOT NULL,
	"pieces" integer DEFAULT 0 NOT NULL,
	"from_location" text DEFAULT '' NOT NULL,
	"to_location" text DEFAULT '' NOT NULL,
	"user_name" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_zone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"bays" integer DEFAULT 0 NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"blocked_bays" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "warehouse_bonded_entry_created_at_idx" ON "warehouse_bonded_entry" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_bonded_entry_deleted_at_idx" ON "warehouse_bonded_entry" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_bonded_entry_company_id_idx" ON "warehouse_bonded_entry" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_stock_line_created_at_idx" ON "warehouse_stock_line" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_stock_line_deleted_at_idx" ON "warehouse_stock_line" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_stock_line_company_id_idx" ON "warehouse_stock_line" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_stock_movement_created_at_idx" ON "warehouse_stock_movement" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_stock_movement_deleted_at_idx" ON "warehouse_stock_movement" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_stock_movement_company_id_idx" ON "warehouse_stock_movement" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_zone_created_at_idx" ON "warehouse_zone" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_zone_deleted_at_idx" ON "warehouse_zone" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_zone_company_id_idx" ON "warehouse_zone" USING btree ("company_id");