-- Tariffs: first / last mile hauliers' collection tariffs (Last / First Mile Collections). A tariff
-- is now rail or collection; a collections tariff ticks the freight it serves (Sea LCL, Air) and its
-- versions keep their price rows, postcode regions, distances and postcode areas. collection_hub
-- holds our end of a collection per freight mode.
CREATE TABLE "collection_area" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"postcode_from" text NOT NULL,
	"postcode_to" text NOT NULL,
	"zone" text NOT NULL,
	"country" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_distance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"from_region" text NOT NULL,
	"to_region" text NOT NULL,
	"km" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_hub" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"freight_mode" text NOT NULL,
	"postcode" text NOT NULL,
	"country" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "collection_hub_mode_check" CHECK ("collection_hub"."freight_mode" IN ('sea_lcl', 'air'))
);
--> statement-breakpoint
CREATE TABLE "collection_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"matrix" integer NOT NULL,
	"row_no" integer NOT NULL,
	"weight_to_kg" double precision NOT NULL,
	"volume_to_cbm" double precision,
	"prices" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_region" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"postcode" text NOT NULL,
	"region" text NOT NULL,
	"country" text NOT NULL,
	"place" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tariff" DROP CONSTRAINT "tariff_mode_check";--> statement-breakpoint
ALTER TABLE "tariff" DROP CONSTRAINT "tariff_ports_check";--> statement-breakpoint
ALTER TABLE "tariff" DROP CONSTRAINT "tariff_directions_check";--> statement-breakpoint
ALTER TABLE "tariff" ADD COLUMN "freight_modes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_area" ADD CONSTRAINT "collection_area_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."tariff_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_distance" ADD CONSTRAINT "collection_distance_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."tariff_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_rate" ADD CONSTRAINT "collection_rate_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."tariff_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_region" ADD CONSTRAINT "collection_region_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."tariff_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_area_company_id_idx" ON "collection_area" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "collection_area_version_postcode_idx" ON "collection_area" USING btree ("version_id","postcode_from");--> statement-breakpoint
CREATE INDEX "collection_distance_company_id_idx" ON "collection_distance" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "collection_distance_version_regions_idx" ON "collection_distance" USING btree ("version_id","from_region","to_region");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_hub_mode_unique" ON "collection_hub" USING btree ("company_id","freight_mode");--> statement-breakpoint
CREATE INDEX "collection_rate_company_id_idx" ON "collection_rate" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "collection_rate_version_idx" ON "collection_rate" USING btree ("version_id","matrix","weight_to_kg");--> statement-breakpoint
CREATE INDEX "collection_region_company_id_idx" ON "collection_region" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "collection_region_version_postcode_idx" ON "collection_region" USING btree ("version_id","postcode","row_no");--> statement-breakpoint
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_freight_modes_check" CHECK ("tariff"."freight_modes" <@ ARRAY['sea_lcl', 'air']::text[] AND ("tariff"."mode" <> 'collection' OR cardinality("tariff"."freight_modes") > 0));--> statement-breakpoint
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_mode_check" CHECK ("tariff"."mode" IN ('rail', 'collection'));--> statement-breakpoint
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_ports_check" CHECK ("tariff"."mode" <> 'rail' OR cardinality("tariff"."ports") > 0);--> statement-breakpoint
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_directions_check" CHECK ("tariff"."directions" <@ ARRAY['import', 'export']::text[] AND ("tariff"."mode" <> 'rail' OR cardinality("tariff"."directions") > 0));