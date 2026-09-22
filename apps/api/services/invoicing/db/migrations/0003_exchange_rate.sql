-- Kurzovni listek s tydenni platnosti (stranka Exchange v sidebaru).
-- Nahrazuje volani na api.cnb.cz - kurzy se zadavaji rucne.
CREATE TABLE "exchange_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"week" text NOT NULL,
	"valid_from" text NOT NULL,
	"valid_to" text NOT NULL,
	"rate_eur" numeric(14, 4),
	"rate_usd" numeric(14, 4),
	"note" text DEFAULT '' NOT NULL
);--> statement-breakpoint
CREATE INDEX "exchange_rate_created_at_idx" ON "exchange_rate" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "exchange_rate_deleted_at_idx" ON "exchange_rate" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "exchange_rate_company_id_idx" ON "exchange_rate" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rate_company_week_unique" ON "exchange_rate" USING btree ("company_id","week");--> statement-breakpoint
CREATE INDEX "exchange_rate_valid_from_idx" ON "exchange_rate" USING btree ("valid_from");
