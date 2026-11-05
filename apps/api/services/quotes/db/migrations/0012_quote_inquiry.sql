CREATE TABLE "quote_inquiry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"quote_number" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"needs_by" timestamp with time zone,
	"competitor_price" text DEFAULT '' NOT NULL,
	"volume" text DEFAULT '' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"notify_user_id" uuid,
	"decision" text,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"approved_margin_czk" double precision,
	"approved_margin_percent" double precision,
	"comment" text DEFAULT '' NOT NULL,
	"self_decision" boolean DEFAULT false NOT NULL,
	"answer_seen_at" timestamp with time zone,
	CONSTRAINT "quote_inquiry_kind_check" CHECK ("quote_inquiry"."kind" IN ('margin')),
	CONSTRAINT "quote_inquiry_status_check" CHECK ("quote_inquiry"."status" IN ('pending', 'approved', 'rejected', 'withdrawn')),
	CONSTRAINT "quote_inquiry_decision_check" CHECK ("quote_inquiry"."decision" IS NULL OR "quote_inquiry"."decision" IN ('approve', 'counter', 'reject'))
);
--> statement-breakpoint
CREATE INDEX "quote_inquiry_company_id_idx" ON "quote_inquiry" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "quote_inquiry_company_status_idx" ON "quote_inquiry" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "quote_inquiry_company_requested_by_idx" ON "quote_inquiry" USING btree ("company_id","requested_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_inquiry_pending_unique" ON "quote_inquiry" USING btree ("quote_id","kind") WHERE status = 'pending' AND deleted_at IS NULL;