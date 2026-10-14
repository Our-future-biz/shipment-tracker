CREATE TABLE "fx_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"fixing_date" date NOT NULL,
	"reason" text NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"email_error" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fx_alert_created_at_idx" ON "fx_alert" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "fx_alert_deleted_at_idx" ON "fx_alert" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_alert_fixing_date_unique" ON "fx_alert" USING btree ("fixing_date");