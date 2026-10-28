-- Tariffs: shipping lines' ocean tariffs (Tariffs → Shipping Lines). A tariff can now be ocean; it
-- ticks import / export like a rail tariff. Its versions keep their rates (a row per port of loading
-- → port of discharge) and the UN/LOCODE each port name of the file means (ocean_port).
CREATE TABLE "ocean_port" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"side" text NOT NULL,
	"name" text NOT NULL,
	"country_hint" text,
	"code" text,
	"status" text NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "ocean_port_side_check" CHECK ("ocean_port"."side" IN ('pol', 'pod')),
	CONSTRAINT "ocean_port_status_check" CHECK ("ocean_port"."status" IN ('matched', 'manual', 'skipped', 'pending'))
);
--> statement-breakpoint
CREATE TABLE "ocean_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"table_no" integer NOT NULL,
	"row_no" integer NOT NULL,
	"pol_name" text NOT NULL,
	"pod_name" text NOT NULL,
	"via" text DEFAULT '' NOT NULL,
	"currency" text NOT NULL,
	"prices" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tariff" DROP CONSTRAINT "tariff_mode_check";--> statement-breakpoint
ALTER TABLE "tariff" DROP CONSTRAINT "tariff_directions_check";--> statement-breakpoint
ALTER TABLE "ocean_port" ADD CONSTRAINT "ocean_port_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."tariff_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocean_rate" ADD CONSTRAINT "ocean_rate_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."tariff_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ocean_port_company_id_idx" ON "ocean_port" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ocean_port_version_name_unique" ON "ocean_port" USING btree ("version_id","side","name");--> statement-breakpoint
CREATE INDEX "ocean_port_version_code_idx" ON "ocean_port" USING btree ("version_id","side","code");--> statement-breakpoint
CREATE INDEX "ocean_rate_company_id_idx" ON "ocean_rate" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ocean_rate_version_pod_idx" ON "ocean_rate" USING btree ("version_id","pod_name");--> statement-breakpoint
CREATE INDEX "ocean_rate_version_row_idx" ON "ocean_rate" USING btree ("version_id","table_no","row_no");--> statement-breakpoint
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_mode_check" CHECK ("tariff"."mode" IN ('rail', 'collection', 'ocean'));--> statement-breakpoint
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_directions_check" CHECK ("tariff"."directions" <@ ARRAY['import', 'export']::text[] AND ("tariff"."mode" NOT IN ('rail', 'ocean') OR cardinality("tariff"."directions") > 0));