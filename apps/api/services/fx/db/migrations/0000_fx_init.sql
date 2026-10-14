CREATE TABLE "cnb_import_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"from_date" date,
	"to_date" date,
	"rows_added" integer DEFAULT 0 NOT NULL,
	"latest_valid_date" date,
	"error" text DEFAULT '' NOT NULL,
	"triggered_by" uuid
);
--> statement-breakpoint
CREATE TABLE "cnb_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"valid_date" date NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"rate" numeric(12, 4) NOT NULL,
	"fixing_no" integer,
	"source" text DEFAULT 'CNB_API' NOT NULL,
	"import_run_id" uuid
);
--> statement-breakpoint
CREATE TABLE "roe_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"pct" numeric(6, 3) NOT NULL,
	"effective_from" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"changed_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cnb_import_run_created_at_idx" ON "cnb_import_run" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cnb_import_run_deleted_at_idx" ON "cnb_import_run" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cnb_rate_created_at_idx" ON "cnb_rate" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cnb_rate_deleted_at_idx" ON "cnb_rate" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cnb_rate_date_currency_unique" ON "cnb_rate" USING btree ("valid_date","currency");--> statement-breakpoint
CREATE INDEX "cnb_rate_currency_date_idx" ON "cnb_rate" USING btree ("currency","valid_date");--> statement-breakpoint
CREATE INDEX "roe_setting_created_at_idx" ON "roe_setting" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "roe_setting_deleted_at_idx" ON "roe_setting" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "roe_setting_company_id_idx" ON "roe_setting" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "roe_setting_company_effective_idx" ON "roe_setting" USING btree ("company_id","effective_from");