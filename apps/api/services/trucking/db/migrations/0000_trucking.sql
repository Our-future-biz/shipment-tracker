CREATE TABLE "trucking_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"customer_id" uuid,
	"by_user_id" uuid,
	"by_name" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trucking_haulier_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"insurer" text DEFAULT '' NOT NULL,
	"insurance_policy_no" text DEFAULT '' NOT NULL,
	"insurance_limit" numeric(14, 2),
	"insurance_currency" text DEFAULT 'EUR' NOT NULL,
	"insurance_valid_to" date,
	"licence_no" text DEFAULT '' NOT NULL,
	"licence_valid_to" date,
	"licence_unlimited" boolean DEFAULT true NOT NULL,
	"adr_capable" boolean DEFAULT false NOT NULL,
	"vehicle_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_days" integer DEFAULT 30 NOT NULL,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"vat_unreliable" boolean DEFAULT false NOT NULL,
	"bank_account_published" boolean DEFAULT false NOT NULL,
	"vat_checked_at" date,
	"cost_split_basis" text DEFAULT 'chargeable_weight' NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"block_reason" text DEFAULT '' NOT NULL,
	"blocked_at" timestamp with time zone,
	"blocked_by" text,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "trucking_haulier_profile_currency_check" CHECK ("trucking_haulier_profile"."currency" IN ('CZK', 'EUR') AND "trucking_haulier_profile"."insurance_currency" IN ('CZK', 'EUR')),
	CONSTRAINT "trucking_haulier_profile_split_check" CHECK ("trucking_haulier_profile"."cost_split_basis" IN ('chargeable_weight', 'ldm', 'pallet_places')),
	CONSTRAINT "trucking_haulier_profile_payment_days_check" CHECK ("trucking_haulier_profile"."payment_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trucking_preferred_lane" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"origin_postcode_from" text NOT NULL,
	"origin_postcode_to" text NOT NULL,
	"dest_postcode_from" text NOT NULL,
	"dest_postcode_to" text NOT NULL,
	"service_kind" text DEFAULT 'ANY' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "trucking_preferred_lane_kind_check" CHECK ("trucking_preferred_lane"."service_kind" IN ('ANY', 'LTL', 'FTL', 'LINEHAUL')),
	CONSTRAINT "trucking_preferred_lane_postcode_check" CHECK ("trucking_preferred_lane"."origin_postcode_from" ~ '^[0-9]{5}$' AND "trucking_preferred_lane"."origin_postcode_to" ~ '^[0-9]{5}$' AND "trucking_preferred_lane"."dest_postcode_from" ~ '^[0-9]{5}$' AND "trucking_preferred_lane"."dest_postcode_to" ~ '^[0-9]{5}$' AND "trucking_preferred_lane"."origin_postcode_from" <= "trucking_preferred_lane"."origin_postcode_to" AND "trucking_preferred_lane"."dest_postcode_from" <= "trucking_preferred_lane"."dest_postcode_to")
);
--> statement-breakpoint
CREATE TABLE "trucking_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"service_levels" jsonb NOT NULL,
	"vehicle_types" jsonb NOT NULL,
	"factors" jsonb NOT NULL,
	"margin_floor" jsonb NOT NULL,
	"transport_order" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trucking_preferred_lane" ADD CONSTRAINT "trucking_preferred_lane_profile_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."trucking_haulier_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trucking_event_company_id_idx" ON "trucking_event" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "trucking_event_customer_idx" ON "trucking_event" USING btree ("company_id","customer_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trucking_haulier_profile_created_at_idx" ON "trucking_haulier_profile" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_profile_deleted_at_idx" ON "trucking_haulier_profile" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_profile_company_id_idx" ON "trucking_haulier_profile" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_haulier_profile_customer_unique" ON "trucking_haulier_profile" USING btree ("company_id","customer_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "trucking_preferred_lane_created_at_idx" ON "trucking_preferred_lane" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_preferred_lane_deleted_at_idx" ON "trucking_preferred_lane" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_preferred_lane_company_id_idx" ON "trucking_preferred_lane" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "trucking_preferred_lane_profile_idx" ON "trucking_preferred_lane" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "trucking_settings_created_at_idx" ON "trucking_settings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_settings_deleted_at_idx" ON "trucking_settings" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_settings_company_id_idx" ON "trucking_settings" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_settings_company_unique" ON "trucking_settings" USING btree ("company_id") WHERE deleted_at IS NULL;--> statement-breakpoint
-- The trucking event log is append-only: what was changed, blocked or unblocked, by whom and
-- why, can never be rewritten or removed afterwards.
CREATE OR REPLACE FUNCTION trucking_event_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Trucking events cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trucking_event_guard BEFORE UPDATE OR DELETE ON "trucking_event"
  FOR EACH ROW EXECUTE FUNCTION trucking_event_guard();
