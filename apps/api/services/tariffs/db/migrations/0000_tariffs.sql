-- Tariffs: suppliers' price lists (rail first), uploaded as their own Excel files, read into data
-- (a draft per upload, approved by a manager) and kept with the file they came from.
CREATE TABLE "rail_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"country" text NOT NULL,
	"postcode" text DEFAULT '' NOT NULL,
	"postcode_from" text,
	"postcode_to" text,
	"place" text NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"via" text DEFAULT '' NOT NULL,
	"empty_depot" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"prices" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"supplier_customer_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb,
	CONSTRAINT "tariff_mode_check" CHECK ("tariff"."mode" IN ('rail'))
);
--> statement-breakpoint
CREATE TABLE "tariff_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"tariff_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"currency" text NOT NULL,
	"layout" jsonb NOT NULL,
	"layout_source" text NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preview" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"source_file_name" text,
	"source_sha256" text,
	"source_key" text,
	"created_by_user_id" uuid,
	"created_by" text,
	"activated_at" timestamp with time zone,
	"activated_by" text,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "tariff_version_status_check" CHECK ("tariff_version"."status" IN ('draft', 'active', 'superseded')),
	CONSTRAINT "tariff_version_layout_source_check" CHECK ("tariff_version"."layout_source" IN ('ai', 'remembered', 'edited')),
	CONSTRAINT "tariff_version_validity_check" CHECK ("tariff_version"."valid_to" IS NULL OR "tariff_version"."valid_from" IS NULL OR "tariff_version"."valid_to" >= "tariff_version"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "rail_rate" ADD CONSTRAINT "rail_rate_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."tariff_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_version" ADD CONSTRAINT "tariff_version_tariff_fk" FOREIGN KEY ("tariff_id") REFERENCES "public"."tariff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rail_rate_company_id_idx" ON "rail_rate" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "rail_rate_version_row_idx" ON "rail_rate" USING btree ("version_id","row_no");--> statement-breakpoint
CREATE INDEX "rail_rate_version_postcode_idx" ON "rail_rate" USING btree ("version_id","postcode_from");--> statement-breakpoint
CREATE INDEX "tariff_company_id_idx" ON "tariff" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "tariff_supplier_idx" ON "tariff" USING btree ("company_id","supplier_customer_id");--> statement-breakpoint
CREATE INDEX "tariff_version_company_id_idx" ON "tariff_version" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "tariff_version_tariff_idx" ON "tariff_version" USING btree ("tariff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_version_no_unique" ON "tariff_version" USING btree ("tariff_id","version_no");