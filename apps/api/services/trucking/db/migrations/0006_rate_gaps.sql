CREATE TABLE "trucking_rate_gap" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"side" text NOT NULL,
	"scope" text NOT NULL,
	"service_level" text DEFAULT '' NOT NULL,
	"postcode" text NOT NULL,
	"reason" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trucking_rate_gap_side_check" CHECK ("trucking_rate_gap"."side" IN ('SELL', 'BUY', 'INTERNAL')),
	CONSTRAINT "trucking_rate_gap_scope_check" CHECK ("trucking_rate_gap"."scope" IN ('LTL', 'FTL', 'LINEHAUL')),
	CONSTRAINT "trucking_rate_gap_count_check" CHECK ("trucking_rate_gap"."count" >= 1)
);
--> statement-breakpoint
CREATE INDEX "trucking_rate_gap_company_id_idx" ON "trucking_rate_gap" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_rate_gap_unique" ON "trucking_rate_gap" USING btree ("company_id","side","scope","service_level","postcode","reason");--> statement-breakpoint
CREATE INDEX "trucking_rate_gap_last_idx" ON "trucking_rate_gap" USING btree ("company_id","last_at");