CREATE TABLE "holiday_country_pref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"countries" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "holiday_country_pref_company_id_idx" ON "holiday_country_pref" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "holiday_country_pref_user_unique" ON "holiday_country_pref" USING btree ("company_id","user_id") WHERE deleted_at IS NULL;