-- Realigns the drizzle snapshot chain.
--
-- Migrations 0002-0004 were hand-written, so no meta/000X_snapshot.json was
-- produced for them and `drizzle-kit generate` kept diffing against 0001 --
-- meaning the next generated migration would have re-emitted all of their DDL.
-- This migration IS that re-emitted DDL, rewritten to be idempotent, and it
-- ships the 0005 snapshot that future generates now diff against.
--
-- On a database where 0002-0004 already ran this is a no-op.
-- On a fresh database it is redundant with them but harmless.

CREATE TABLE IF NOT EXISTS "exchange_rate" (
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
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_selling_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"customer" text DEFAULT '' NOT NULL,
	"qty" numeric(14, 2),
	"amount" numeric(14, 2),
	"currency" text DEFAULT 'CZK' NOT NULL,
	"invoice" boolean DEFAULT true NOT NULL,
	"source_buy_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_cost" ALTER COLUMN "category" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "est_qty" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "real_qty" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "received" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exchange_rate_created_at_idx" ON "exchange_rate" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exchange_rate_deleted_at_idx" ON "exchange_rate" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exchange_rate_company_id_idx" ON "exchange_rate" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exchange_rate_company_week_unique" ON "exchange_rate" USING btree ("company_id","week");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exchange_rate_valid_from_idx" ON "exchange_rate" USING btree ("valid_from");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_selling_cost_created_at_idx" ON "invoice_selling_cost" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_selling_cost_deleted_at_idx" ON "invoice_selling_cost" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_selling_cost_company_id_idx" ON "invoice_selling_cost" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_selling_cost_shipment_id_idx" ON "invoice_selling_cost" USING btree ("shipment_id");
