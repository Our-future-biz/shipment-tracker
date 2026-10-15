-- Hand-added: btree_gist lets the tariff-version EXCLUDE constraint (end of file) compare the tariff with "=" next to the validity overlap. It is a trusted extension (the app's role may create it), as for the warehouse dock slots.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TABLE "trucking_fuel_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"month" text NOT NULL,
	"percent" numeric(6, 3) NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "trucking_fuel_index_month_check" CHECK ("trucking_fuel_index"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "trucking_fuel_index_percent_check" CHECK ("trucking_fuel_index"."percent" >= 0 AND "trucking_fuel_index"."percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "trucking_tariff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"side" text NOT NULL,
	"scope" text NOT NULL,
	"mode" text DEFAULT 'MATRIX' NOT NULL,
	"name" text NOT NULL,
	"owner_customer_id" uuid,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"zone_by" text DEFAULT 'DESTINATION' NOT NULL,
	"discount_percent" numeric(7, 3),
	CONSTRAINT "trucking_tariff_side_check" CHECK ("trucking_tariff"."side" IN ('BUY', 'SELL', 'INTERNAL')),
	CONSTRAINT "trucking_tariff_scope_check" CHECK ("trucking_tariff"."scope" IN ('LTL', 'FTL', 'LINEHAUL')),
	CONSTRAINT "trucking_tariff_currency_check" CHECK ("trucking_tariff"."currency" IN ('CZK', 'EUR')),
	CONSTRAINT "trucking_tariff_zone_by_check" CHECK ("trucking_tariff"."zone_by" IN ('DESTINATION', 'ORIGIN')),
	CONSTRAINT "trucking_tariff_owner_check" CHECK (("trucking_tariff"."side" = 'BUY' AND "trucking_tariff"."owner_customer_id" IS NOT NULL) OR "trucking_tariff"."side" = 'SELL' OR ("trucking_tariff"."side" = 'INTERNAL' AND "trucking_tariff"."owner_customer_id" IS NULL)),
	CONSTRAINT "trucking_tariff_mode_check" CHECK (("trucking_tariff"."mode" = 'MATRIX' AND "trucking_tariff"."discount_percent" IS NULL) OR ("trucking_tariff"."mode" = 'DISCOUNT' AND "trucking_tariff"."side" = 'SELL' AND "trucking_tariff"."owner_customer_id" IS NOT NULL AND "trucking_tariff"."discount_percent" IS NOT NULL AND "trucking_tariff"."discount_percent" > -100 AND "trucking_tariff"."discount_percent" < 100))
);
--> statement-breakpoint
CREATE TABLE "trucking_tariff_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"tariff_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"input" jsonb NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"service_levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"zone_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_by" text,
	"activated_at" timestamp with time zone,
	"activated_by" text,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "trucking_tariff_version_validity_check" CHECK ("trucking_tariff_version"."valid_to" IS NULL OR "trucking_tariff_version"."valid_to" >= "trucking_tariff_version"."valid_from"),
	CONSTRAINT "trucking_tariff_version_superseded_check" CHECK ("trucking_tariff_version"."superseded_at" IS NULL OR "trucking_tariff_version"."activated_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "trucking_tariff_version" ADD CONSTRAINT "trucking_tariff_version_tariff_fk" FOREIGN KEY ("tariff_id") REFERENCES "public"."trucking_tariff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trucking_fuel_index_created_at_idx" ON "trucking_fuel_index" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_fuel_index_deleted_at_idx" ON "trucking_fuel_index" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_fuel_index_company_id_idx" ON "trucking_fuel_index" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_fuel_index_month_unique" ON "trucking_fuel_index" USING btree ("company_id","month");--> statement-breakpoint
CREATE INDEX "trucking_tariff_created_at_idx" ON "trucking_tariff" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_tariff_deleted_at_idx" ON "trucking_tariff" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_tariff_company_id_idx" ON "trucking_tariff" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_tariff_owner_unique" ON "trucking_tariff" USING btree ("company_id","side","scope","owner_customer_id") WHERE deleted_at IS NULL AND owner_customer_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_tariff_no_owner_unique" ON "trucking_tariff" USING btree ("company_id","side","scope") WHERE deleted_at IS NULL AND owner_customer_id IS NULL;--> statement-breakpoint
CREATE INDEX "trucking_tariff_version_created_at_idx" ON "trucking_tariff_version" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_tariff_version_deleted_at_idx" ON "trucking_tariff_version" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_tariff_version_company_id_idx" ON "trucking_tariff_version" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "trucking_tariff_version_tariff_idx" ON "trucking_tariff_version" USING btree ("tariff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_tariff_version_no_unique" ON "trucking_tariff_version" USING btree ("tariff_id","version_no");--> statement-breakpoint
-- Hand-added: at most one binding version of a tariff on any day. Activated, not superseded, live versions of one tariff may not overlap by a single day ("[]" bounds: valid_to is the last day; NULL = open end). Drafts, superseded and discarded versions do not count. The activation also locks the tariff row and closes the previous version in the same transaction; this is the backstop. drizzle-kit cannot model EXCLUDE, so it is not in the snapshot and a later generate will not drop it.
ALTER TABLE "trucking_tariff_version" ADD CONSTRAINT "trucking_tariff_version_no_overlap"
  EXCLUDE USING gist ("tariff_id" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)
  WHERE ("deleted_at" IS NULL AND "activated_at" IS NOT NULL AND "superseded_at" IS NULL);