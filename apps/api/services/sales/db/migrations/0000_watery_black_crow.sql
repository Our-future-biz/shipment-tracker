CREATE TABLE "sales_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"pref_key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "sales_preference_pref_key_unique" UNIQUE("pref_key")
);
--> statement-breakpoint
CREATE TABLE "terms_condition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"includes" text DEFAULT '' NOT NULL,
	"excludes" text DEFAULT '' NOT NULL,
	CONSTRAINT "terms_condition_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "sales_preference_created_at_idx" ON "sales_preference" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sales_preference_deleted_at_idx" ON "sales_preference" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "sales_preference_pref_key_idx" ON "sales_preference" USING btree ("pref_key");--> statement-breakpoint
CREATE INDEX "terms_condition_created_at_idx" ON "terms_condition" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "terms_condition_deleted_at_idx" ON "terms_condition" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "terms_condition_name_idx" ON "terms_condition" USING btree ("name");