CREATE TABLE "public_holiday" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"country_code" text DEFAULT '' NOT NULL,
	"national_holiday" text DEFAULT '' NOT NULL,
	"national_start" date,
	"national_end" date,
	"regional_holiday" text DEFAULT '' NOT NULL,
	"regional_start" date,
	"regional_end" date,
	"regions" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "public_holiday_created_at_idx" ON "public_holiday" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "public_holiday_deleted_at_idx" ON "public_holiday" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "public_holiday_company_id_idx" ON "public_holiday" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "public_holiday_national_start_idx" ON "public_holiday" USING btree ("national_start");--> statement-breakpoint
CREATE INDEX "public_holiday_regional_start_idx" ON "public_holiday" USING btree ("regional_start");