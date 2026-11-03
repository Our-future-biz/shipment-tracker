CREATE TABLE "quote_guardrail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"service_type" text NOT NULL,
	"percent" double precision NOT NULL,
	"min_amount_czk" double precision NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE INDEX "quote_guardrail_company_id_idx" ON "quote_guardrail" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_guardrail_company_mode_unique" ON "quote_guardrail" USING btree ("company_id","service_type") WHERE deleted_at IS NULL;